import type { DatabaseSync } from "node:sqlite";

/** Sem acento e minúsculo: "Revelação" acha "revelacao". */
export const foldText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type MessageHit = {
  conversationId: string;
  messageId: string;
  contactName: string;
  phone: string;
  author: string;
  snippet: string;
  createdAt: string;
};

/** Trecho em volta da 1ª palavra encontrada (para mostrar na lista). */
export function snippetAround(body: string, word: string, radius = 50) {
  const index = foldText(body).indexOf(word);
  const text = body.replace(/\s+/g, " ");
  if (index < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + word.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/**
 * Procura texto em todas as conversas (mensagens, legendas e notas; sem avisos do sistema).
 * Todas as palavras precisam aparecer na mesma mensagem. Mais novas primeiro.
 */
export function searchMessages(db: DatabaseSync, query: string, limit = 30): MessageHit[] {
  const words = foldText(query).split(/\s+/).filter((word) => word.length >= 2);
  if (!words.length) return [];
  const rows = db
    .prepare(
      `SELECT m.id, m.conversation_id, m.body, m.author, m.created_at, c.contact_name, c.phone
       FROM atd_messages m JOIN atd_conversations c ON c.id = m.conversation_id
       WHERE m.author <> 'sistema' AND m.body <> '' ORDER BY m.created_at DESC LIMIT 20000`,
    )
    .all() as Array<Record<string, string>>;
  const hits: MessageHit[] = [];
  for (const row of rows) {
    const folded = foldText(row.body);
    if (!words.every((word) => folded.includes(word))) continue;
    hits.push({
      conversationId: row.conversation_id,
      messageId: row.id,
      contactName: row.contact_name ?? "",
      phone: row.phone,
      author: row.author,
      snippet: snippetAround(row.body, words[0]),
      createdAt: row.created_at,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
