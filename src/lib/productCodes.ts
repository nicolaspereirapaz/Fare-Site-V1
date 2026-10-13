import type { DatabaseSync } from "node:sqlite";
import type { Product, SupplierId } from "@/lib/xbz";

/**
 * Códigos de produto.
 * - Código Fare Foto (X10001, S10001, A10001): visto pelo cliente cadastrado. É um número próprio,
 *   por isso não leva ao fornecedor numa busca. Letra: X = XBZ, S = Spot, A = Asia Import.
 * - Código real do fornecedor (06520, 11110, BT316) e SKU da cor: só no painel da equipe.
 * Os números ficam gravados no banco do catálogo e nunca mudam para um produto já numerado.
 */
export const SUPPLIER_LABELS: Record<SupplierId, string> = { xbz: "XBZ", spot: "Spot", asia: "Asia Import" };
const LETTERS: Record<SupplierId, string> = { xbz: "X", spot: "S", asia: "A" };
const FIRST_NUMBER = 10001;

export function supplierOf(product: Pick<Product, "supplier">): SupplierId {
  return product.supplier ?? "xbz";
}

function rawFamily(product: Pick<Product, "familyCode" | "compoundCode" | "sku" | "id">): string {
  return (product.familyCode || product.compoundCode || product.sku || product.id).replace(/^(spot|asia):/, "");
}

/** Código do produto como o fornecedor usa (sem o "P" que a Asia acrescenta ao produto-pai). */
export function supplierCodeOf(variants: Array<Pick<Product, "familyCode" | "compoundCode" | "sku" | "id" | "supplier">>): string {
  const first = variants[0];
  if (!first) return "";
  const code = rawFamily(first);
  if (supplierOf(first) === "asia" && /P$/i.test(code)) {
    const withoutP = code.slice(0, -1);
    if (variants.some((variant) => variant.sku === withoutP || variant.sku.startsWith(`${withoutP}-`))) return withoutP;
  }
  return code;
}

/** Chave única do produto (fornecedor + código), usada para guardar o código Fare Foto. */
export function familyKey(product: Pick<Product, "familyCode" | "compoundCode" | "sku" | "id" | "supplier">): string {
  return `${supplierOf(product)}:${supplierCodeOf([product])}`;
}

export function migrateProductCodes(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fare_product_codes (
      family_key TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      letter TEXT NOT NULL,
      number INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

/** Devolve o código Fare Foto de cada produto, numerando os que ainda não têm (na ordem recebida). */
export function assignFareCodes(database: DatabaseSync, products: Product[]): Map<string, string> {
  migrateProductCodes(database);
  const codes = new Map(
    (database.prepare("SELECT family_key, code FROM fare_product_codes").all() as Array<{ family_key: string; code: string }>)
      .map((row) => [row.family_key, row.code]),
  );

  const missing: Array<{ key: string; letter: string }> = [];
  const queued = new Set<string>();
  for (const product of products) {
    const key = familyKey(product);
    if (codes.has(key) || queued.has(key)) continue;
    queued.add(key);
    missing.push({ key, letter: LETTERS[supplierOf(product)] });
  }
  if (!missing.length) return codes;

  const next = new Map(
    (database.prepare("SELECT letter, MAX(number) AS last FROM fare_product_codes GROUP BY letter").all() as Array<{ letter: string; last: number }>)
      .map((row) => [row.letter, row.last + 1]),
  );
  const insert = database.prepare("INSERT INTO fare_product_codes (family_key, code, letter, number, created_at) VALUES (?, ?, ?, ?, ?)");
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const { key, letter } of missing) {
      const number = next.get(letter) ?? FIRST_NUMBER;
      next.set(letter, number + 1);
      const code = `${letter}${number}`;
      insert.run(key, code, letter, number, now);
      codes.set(key, code);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return codes;
}

export function isFareCodeQuery(query: string): boolean {
  return /^[xsa]\d{5,}$/i.test(query.trim());
}

/** Códigos gravados no item do pedido/orçamento (só o painel da equipe mostra o real e o SKU). */
export type ItemCodes = {
  fare: string;
  supplier: SupplierId;
  supplierCode: string;
  sku: string;
};
