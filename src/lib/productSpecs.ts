import type { DatabaseSync } from "node:sqlite";

/*
 * Medidas do produto (largura, comprimento, área de gravação, peso…), que vão para a equipe e para a proposta.
 * - Spot: vêm no catálogo (CombinedSizes), guardadas junto do produto na sincronização.
 * - XBZ: a API não manda; ficam só na página pública do produto. Lidas uma vez e guardadas por 30 dias.
 */

export type ProductSpec = { label: string; value: string };

/** "Largura: 6,7 cm" — como aparece na proposta. */
// "Medidas" já é o título do bloco no documento: não repete.
export const specLine = (spec: ProductSpec) => (spec.label === "Medidas" ? spec.value : `${spec.label}: ${spec.value}`);

/** "ø7 x 190 mm" → "diâmetro 7 x 190 mm" (o símbolo ø confunde quem lê). */
export const tidySpecValue = (value: string) => value.replace(/[øØ⌀]\s*/g, "diâmetro ").trim();

/** Spot: medidas do produto (ex.: "55 x 22 x 12 mm"); roupa traz os tamanhos. */
export function spotSpecs(raw: Record<string, unknown>): ProductSpec[] {
  const sizes = typeof raw.CombinedSizes === "string" ? tidySpecValue(raw.CombinedSizes) : "";
  if (!sizes) return [];
  return [{ label: raw.IsTextil === true || raw.HasSizes === true ? "Tamanhos" : "Medidas", value: sizes }];
}

const cm = (mm: string) => `${(Number(mm.replace(",", ".")) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;

/**
 * Spot manda "250 x 420 x 180 mm" (largura x altura x profundidade) ou "diâmetro 66 x 210 mm" (diâmetro x altura).
 * Separa em itens como a XBZ ("Altura: 21 cm"), para a página do produto ficar igual. Formato desconhecido: fica como veio.
 */
export function splitSpotMeasures(specs: ProductSpec[]): ProductSpec[] {
  return specs.flatMap((spec) => {
    if (spec.label !== "Medidas") return [spec];
    const round = /^diâmetro\s*([\d.,]+)\s*x\s*([\d.,]+)\s*mm$/i.exec(spec.value);
    if (round) return [{ label: "Altura", value: cm(round[2]) }, { label: "Diâmetro", value: cm(round[1]) }];
    const box = /^([\d.,]+)\s*x\s*([\d.,]+)(?:\s*x\s*([\d.,]+))?\s*mm$/i.exec(spec.value);
    if (!box) return [spec];
    const parts = [{ label: "Altura", value: cm(box[2]) }, { label: "Largura", value: cm(box[1]) }];
    return box[3] ? [...parts, { label: "Profundidade", value: cm(box[3]) }] : parts;
  });
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) => text
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? all;
    const n = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
    return Number.isFinite(n) ? String.fromCodePoint(n) : all;
  })
  .replace(/\s+/g, " ")
  .trim();
const UNIT = /^(g|kg|ml|l|cm|mm|m|gb|mah)$/i;

/** Página da XBZ: blocos "<p class='desc-tit'>Largura<span class='desc-sub'>&nbsp;:&nbsp; 6,7 cm</span></p>". */
export function parseXbzSpecs(html: string): ProductSpec[] {
  const specs: ProductSpec[] = [];
  for (const match of html.matchAll(/<p class=['"]desc-tit['"]>([^<]*)<span class=['"][^'"]*desc-sub[^'"]*['"]>([\s\S]*?)<\/span>/gi)) {
    let label = decode(match[1]);
    if (!label || /^descri/i.test(label)) continue;
    const parts = /^(?:\(([^)]*)\))?\s*:\s*([\s\S]*)$/.exec(decode(match[2]));
    let value = parts ? parts[2].trim() : decode(match[2]);
    const note = parts?.[1]?.trim();
    if (!value) continue;
    if (note && UNIT.test(note)) value = `${value} ${note}`;
    else if (note) label = `${label} (${note.replace(/x/i, "×")})`;
    label = label.replace(/^Medidas aproximadas para grava[çc][ãa]o/i, "Área de gravação").replace(/^Peso aproximado/i, "Peso");
    // A página repete o bloco (computador e celular).
    if (!specs.some((spec) => spec.label === label)) specs.push({ label, value });
  }
  return specs;
}

const XBZ_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const inFlight = new Map<string, Promise<ProductSpec[]>>();

function ensureTable(database: DatabaseSync) {
  database.exec("CREATE TABLE IF NOT EXISTS xbz_product_specs (family_code TEXT PRIMARY KEY, specs_json TEXT NOT NULL, fetched_at TEXT NOT NULL)");
}

async function readPage(url: string, fetcher: typeof fetch) {
  const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (FareFoto)" } });
  if (!response.ok) throw new Error(`XBZ respondeu ${response.status}`);
  const bytes = await response.arrayBuffer();
  // O site da XBZ é em Latin-1; se um dia vier em UTF-8, também funciona.
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

/** Medidas de um produto XBZ pelo código (ex.: "10250"). Sem internet ou página fora do ar: devolve o que tiver guardado (ou nada). */
export async function xbzSpecs(database: DatabaseSync, familyCode: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<ProductSpec[]> {
  if (!/^\d{3,8}$/.test(familyCode)) return [];
  ensureTable(database);
  const cached = database.prepare("SELECT specs_json, fetched_at FROM xbz_product_specs WHERE family_code = ?").get(familyCode) as { specs_json: string; fetched_at: string } | undefined;
  const stored = cached ? (JSON.parse(cached.specs_json) as ProductSpec[]) : [];
  if (cached && now.getTime() - Date.parse(cached.fetched_at) < XBZ_TTL_MS) return stored;
  const running = inFlight.get(familyCode);
  if (running) return running;
  const job = readPage(`https://www.xbzbrindes.com.br/${familyCode}`, fetcher)
    .then((html) => {
      const specs = parseXbzSpecs(html);
      database.prepare("INSERT INTO xbz_product_specs (family_code, specs_json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(family_code) DO UPDATE SET specs_json = excluded.specs_json, fetched_at = excluded.fetched_at")
        .run(familyCode, JSON.stringify(specs), now.toISOString());
      return specs;
    })
    .catch(() => stored)
    .finally(() => inFlight.delete(familyCode));
  inFlight.set(familyCode, job);
  return job;
}

/**
 * Busca de uma vez as medidas XBZ que ainda não estão guardadas (ou venceram), uma página por vez.
 * Grava em lotes: cada gravação no banco do catálogo faz o catálogo da memória ser remontado.
 * Página que falhar fica para a próxima rodada. Devolve quantas faltavam.
 */
export async function fillMissingXbzSpecs(
  database: DatabaseSync, familyCodes: string[], fetcher: typeof fetch = fetch, now = new Date(), pauseMs = 500,
) {
  ensureTable(database);
  const since = new Date(now.getTime() - XBZ_TTL_MS).toISOString();
  const fresh = new Set((database.prepare("SELECT family_code FROM xbz_product_specs WHERE fetched_at > ?").all(since) as Array<{ family_code: string }>).map((row) => row.family_code));
  const missing = [...new Set(familyCodes)].filter((code) => /^\d{3,8}$/.test(code) && !fresh.has(code));
  const save = database.prepare("INSERT INTO xbz_product_specs (family_code, specs_json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(family_code) DO UPDATE SET specs_json = excluded.specs_json, fetched_at = excluded.fetched_at");
  let batch: Array<[string, ProductSpec[]]> = [];
  const flush = () => {
    if (!batch.length) return;
    database.exec("BEGIN");
    try {
      for (const [code, specs] of batch) save.run(code, JSON.stringify(specs), now.toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    batch = [];
  };
  for (const code of missing) {
    try {
      batch.push([code, parseXbzSpecs(await readPage(`https://www.xbzbrindes.com.br/${code}`, fetcher))]);
    } catch { /* fora do ar ou página sumiu: tenta na próxima rodada */ }
    if (batch.length >= 100) flush();
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  flush();
  return missing.length;
}

const FILL_INTERVAL_MS = 60 * 60 * 1000;
const fillState = globalThis as typeof globalThis & { xbzSpecsFill?: Promise<unknown>; xbzSpecsFillAt?: number };

/** No máximo uma rodada por hora: assim produto novo da XBZ ganha as medidas sem ninguém abrir a página dele. */
export function fillXbzSpecsInBackground(database: DatabaseSync, familyCodes: () => string[], now = Date.now()) {
  if (fillState.xbzSpecsFill || now - (fillState.xbzSpecsFillAt ?? 0) < FILL_INTERVAL_MS) return;
  fillState.xbzSpecsFillAt = now;
  fillState.xbzSpecsFill = fillMissingXbzSpecs(database, familyCodes())
    .catch((error) => console.error("[medidas] busca falhou:", error instanceof Error ? error.message : error))
    .finally(() => { fillState.xbzSpecsFill = undefined; });
}
