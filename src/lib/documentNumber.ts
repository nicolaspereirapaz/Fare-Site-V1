import type { DatabaseSync } from "node:sqlite";

/*
 * Numeração única de orçamentos e pedidos: ORC-0001 já reserva o PED-0001.
 * O número fica no começo do id ("0001-<uuid>"), então ORC/PED saem do próprio id, em qualquer tela.
 * Pedido sem orçamento (site, fotos, pedido direto) pega o próximo número livre — nunca repete.
 */
// Número + uuid completo; um id antigo (só uuid, mesmo começando com algarismos) não casa.
const NUMBERED = /^(\d{4,})-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "0001-…" → 1; id antigo (sem número) → null. */
export function documentNumberOf(id: string): number | null {
  const match = NUMBERED.exec(id);
  return match ? Number(match[1]) : null;
}

export const formatDocumentNumber = (n: number) => String(n).padStart(4, "0");

/** Próximo número da sequência (atômico: duas gravações ao mesmo tempo nunca pegam o mesmo). */
export function nextDocumentNumber(database: DatabaseSync): number {
  database.exec("CREATE TABLE IF NOT EXISTS fare_document_sequence (id INTEGER PRIMARY KEY CHECK (id = 1), last INTEGER NOT NULL)");
  database.prepare("INSERT OR IGNORE INTO fare_document_sequence (id, last) VALUES (1, 0)").run();
  return (database.prepare("UPDATE fare_document_sequence SET last = last + 1 WHERE id = 1 RETURNING last").get() as { last: number }).last;
}

/** Id de um orçamento/pedido novo com o número na frente. */
export const numberedId = (n: number) => `${formatDocumentNumber(n)}-${crypto.randomUUID()}`;
