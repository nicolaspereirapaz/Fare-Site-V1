import type { DatabaseSync } from "node:sqlite";
import type { Product } from "@/lib/xbz";

/**
 * Verificação diária das fotos dos fornecedores.
 * Uma vez por dia o servidor abre cada foto dos produtos à venda (só o 1º byte). A que não abrir em
 * duas tentativas é marcada como quebrada: aquela cor passa a usar a foto de outra cor e, se o produto
 * ficar sem nenhuma foto boa, ele sai da loja. Na verificação seguinte, se a foto voltar, ele volta.
 */
export type ImageProbe = { status: number; contentType: string };
export type ImageFetcher = (url: string) => Promise<ImageProbe>;
export type ImageCheckState = { lastStartedAt: string | null; lastFinishedAt: string | null; checked: number; broken: number };

const DAY_MS = 24 * 60 * 60 * 1000;

const globalState = globalThis as typeof globalThis & { imageHealthCheck?: Promise<unknown> };

export function migrateImageHealth(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS image_health (
      url TEXT PRIMARY KEY,
      ok INTEGER NOT NULL,
      status INTEGER NOT NULL,
      checked_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS image_check_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      last_started_at TEXT,
      last_finished_at TEXT,
      checked INTEGER NOT NULL DEFAULT 0,
      broken INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export const defaultImageFetcher: ImageFetcher = async (url) => {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(20_000),
    });
    void response.body?.cancel().catch(() => undefined);
    return { status: response.status, contentType: response.headers.get("content-type") ?? "" };
  } catch {
    return { status: 0, contentType: "" };
  }
};

function opensAsImage(probe: ImageProbe) {
  return (probe.status === 200 || probe.status === 206) && !/text\/html/i.test(probe.contentType);
}

export function imageCheckDue(lastStartedAt: string | null, now: Date) {
  return !lastStartedAt || now.getTime() - new Date(lastStartedAt).getTime() >= DAY_MS;
}

export function readImageCheckState(database: DatabaseSync): ImageCheckState | null {
  migrateImageHealth(database);
  const row = database.prepare("SELECT * FROM image_check_state WHERE singleton = 1").get() as {
    last_started_at: string | null; last_finished_at: string | null; checked: number; broken: number;
  } | undefined;
  return row
    ? { lastStartedAt: row.last_started_at, lastFinishedAt: row.last_finished_at, checked: row.checked, broken: row.broken }
    : null;
}

export function readBrokenImages(database: DatabaseSync): Set<string> {
  migrateImageHealth(database);
  const rows = database.prepare("SELECT url FROM image_health WHERE ok = 0").all() as Array<{ url: string }>;
  return new Set(rows.map((row) => row.url));
}

export async function runImageCheck(
  database: DatabaseSync,
  urls: string[],
  { fetcher = defaultImageFetcher, concurrency = 12, retryDelayMs = 2000, now = new Date() }:
    { fetcher?: ImageFetcher; concurrency?: number; retryDelayMs?: number; now?: Date } = {},
) {
  migrateImageHealth(database);
  database.prepare(`INSERT INTO image_check_state (singleton, last_started_at) VALUES (1, ?)
    ON CONFLICT(singleton) DO UPDATE SET last_started_at = excluded.last_started_at`).run(now.toISOString());

  const queue = [...new Set(urls.filter(Boolean))];
  const results: Array<{ url: string; ok: boolean; status: number }> = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      let probe = await fetcher(url);
      if (!opensAsImage(probe)) {
        // Segunda chance: falha passageira de rede não pode tirar o produto da loja.
        if (retryDelayMs) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        probe = await fetcher(url);
      }
      results.push({ url, ok: opensAsImage(probe), status: probe.status });
    }
  }));

  const checkedAt = new Date().toISOString();
  const save = database.prepare("INSERT OR REPLACE INTO image_health (url, ok, status, checked_at) VALUES (?, ?, ?, ?)");
  const broken = results.filter((result) => !result.ok).length;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const result of results) save.run(result.url, result.ok ? 1 : 0, result.status, checkedAt);
    database.prepare("UPDATE image_check_state SET last_finished_at = ?, checked = ?, broken = ? WHERE singleton = 1")
      .run(checkedAt, results.length, broken);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { checked: results.length, broken };
}

/** Foto quebrada vira "sem foto": a cor usa a foto de outra cor e o produto sem nenhuma foto sai da loja. */
export function hideBrokenImages(products: Product[], broken: Set<string>): Product[] {
  if (!broken.size) return products;
  return products.map((product) => (broken.has(product.imageUrl) ? { ...product, imageUrl: "" } : product));
}

/** Dispara (sem esperar) a verificação do dia, se ainda não rodou nas últimas 24 h. */
export function refreshImageHealthInBackground(database: DatabaseSync, products: Product[], now = new Date()) {
  if (globalState.imageHealthCheck) return;
  if (!imageCheckDue(readImageCheckState(database)?.lastStartedAt ?? null, now)) return;
  const urls = products.filter((product) => product.stockAvailable > 0).map((product) => product.imageUrl);
  globalState.imageHealthCheck = runImageCheck(database, urls, { now })
    .catch((error) => console.error("[fotos] verificação falhou:", error instanceof Error ? error.message : error))
    .finally(() => {
      globalState.imageHealthCheck = undefined;
    });
}
