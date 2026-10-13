import type { DatabaseSync } from "node:sqlite";
import type { OpcaoSpot } from "@/lib/backoffice/customization";
import { decimal, fetchJson, text } from "./shared";

/**
 * Personalizações que a própria Spot faz (customizationOptions): técnica, local, área, nº de cores
 * e preço por faixa de quantidade. Sincronizadas 1x por dia num snapshot local; usadas só no
 * painel da equipe para formar o preço de orçamentos de produtos Spot.
 */
type Raw = Record<string, unknown>;

export type SpotCustomization = OpcaoSpot & { componente: string };

function areaLabel(option: Raw) {
  const table = text(option.TableMaxAreaCM);
  if (table && !table.startsWith("99.9")) return `${table.replace(/\s*x\s*/i, " × ")} cm`;
  const location = text(option.LocationMaxPrintingAreaMM);
  return location ? `${location.replace(/\s*x\s*/i, " × ")} mm` : "";
}

export function normalizeSpotCustomizations(options: Raw[]): Map<string, SpotCustomization[]> {
  const result = new Map<string, SpotCustomization[]>();
  for (const option of options) {
    const reference = text(option.ProdReference);
    if (!reference) continue;
    const faixas = Array.from({ length: 15 }, (_, index) => ({
      minimo: decimal(option[`MinQt${index + 1}`]),
      preco: decimal(option[`Price${index + 1}`]),
    }))
      .filter((faixa): faixa is { minimo: number; preco: number } => faixa.minimo !== null && faixa.preco !== null && faixa.preco > 0)
      .sort((a, b) => a.minimo - b.minimo);
    if (!faixas.length) continue;
    const list = result.get(reference) ?? [];
    list.push({
      id: text(option.ServiceCode) || `${reference}-${list.length}`,
      tecnica: text(option.CustomizationTypeName),
      local: text(option.Location),
      componente: text(option.Component),
      area: areaLabel(option),
      cores: decimal(option.MaxColors) ?? 1,
      padrao: option.IsDefault === true || text(option.IsDefault).toLowerCase() === "true",
      faixas,
    });
    result.set(reference, list);
  }
  return result;
}

export function migrateSpotCustomizations(database: DatabaseSync) {
  database.exec(`CREATE TABLE IF NOT EXISTS spot_customizations (
    reference TEXT PRIMARY KEY,
    options_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

export function replaceSpotCustomizations(database: DatabaseSync, map: Map<string, SpotCustomization[]>, now: string) {
  migrateSpotCustomizations(database);
  const insert = database.prepare("INSERT INTO spot_customizations (reference, options_json, updated_at) VALUES (?, ?, ?)");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("DELETE FROM spot_customizations");
    for (const [reference, options] of map) insert.run(reference, JSON.stringify(options), now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function readSpotCustomizations(database: DatabaseSync, reference: string): SpotCustomization[] {
  migrateSpotCustomizations(database);
  const row = database.prepare("SELECT options_json FROM spot_customizations WHERE reference = ?").get(reference) as { options_json: string } | undefined;
  return row ? (JSON.parse(row.options_json) as SpotCustomization[]) : [];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const globalState = globalThis as typeof globalThis & { spotCustomizationSync?: Promise<unknown> };

export function spotCustomizationsUpdatedAt(database: DatabaseSync): string | null {
  migrateSpotCustomizations(database);
  return (database.prepare("SELECT MAX(updated_at) AS at FROM spot_customizations").get() as { at: string | null }).at;
}

export async function syncSpotCustomizations(database: DatabaseSync) {
  const map = await fetchSpotCustomizations();
  if (!map.size) throw new Error("a Spot devolveu a lista de personalizações vazia");
  replaceSpotCustomizations(database, map, new Date().toISOString());
  return map.size;
}

/** Atualiza 1x por dia, em segundo plano (o painel usa a última cópia enquanto isso). */
export function refreshSpotCustomizationsInBackground(database: DatabaseSync, now = new Date()) {
  if (globalState.spotCustomizationSync || !process.env.SPOT_ACCESS_KEY) return;
  const last = spotCustomizationsUpdatedAt(database);
  if (last && now.getTime() - new Date(last).getTime() < DAY_MS) return;
  globalState.spotCustomizationSync = syncSpotCustomizations(database)
    .catch((error) => console.error("[spot] personalizações:", error instanceof Error ? error.message : error))
    .finally(() => {
      globalState.spotCustomizationSync = undefined;
    });
}

export async function fetchSpotCustomizations(): Promise<Map<string, SpotCustomization[]>> {
  const accessKey = process.env.SPOT_ACCESS_KEY;
  const base = (process.env.SPOT_BASE_URL ?? "https://ws.spotgifts.com.br/api/v1SSL").replace(/\/$/, "");
  if (!accessKey) throw new Error("Configure SPOT_ACCESS_KEY no arquivo .env.local.");
  const auth = await fetchJson(`${base}/AuthenticateClient?accessKey=${encodeURIComponent(accessKey)}`, {}, "Spot (login)", 30_000) as Raw;
  const token = text(auth.Token);
  if (!token) throw new Error("Spot recusou a chave de acesso.");
  try {
    const payload = await fetchJson(`${base}/customizationOptions?token=${encodeURIComponent(token)}&lang=PT`, {}, "Spot (personalizações)", 180_000) as Raw;
    const list = payload.CustomizationOptions;
    if (!Array.isArray(list)) throw new Error("Spot (personalizações) não devolveu a lista esperada.");
    return normalizeSpotCustomizations(list as Raw[]);
  } finally {
    void fetch(`${base}/CloseSession?token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => undefined);
  }
}
