import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CONVERSATION_STATUS_LABELS,
  isConversationStatus,
  type AuthorKind,
  type Channel,
  type Conversation,
  type ConversationStatus,
  DEFAULT_TAGS,
  isInternal,
  type MediaKind,
  type Message,
  PIX_TOKEN,
  type QuickReply,
} from "@/lib/atendimento/types";

export type AtendimentoErrorCode = "CONVERSATION_NOT_FOUND" | "INVALID_REQUEST" | "QUICK_REPLY_NOT_FOUND" | "DUPLICATE_SHORTCUT";

/** Erros com código estável: a API devolve o código e o painel mostra a frase. (Sem "parameter properties": scripts rodam com node --experimental-strip-types.) */
export class AtendimentoError extends Error {
  readonly code: AtendimentoErrorCode;
  readonly detail?: string;
  constructor(code: AtendimentoErrorCode, message?: string, detail?: string) {
    super(message ?? code);
    this.code = code;
    this.detail = detail;
  }
}

export type StaffActor = { id: string; name: string };

const nowIso = () => new Date().toISOString();
export const phoneDigits = (value: string) => value.replace(/\D/g, "");
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Primeira versão do banco do atendimento. Idempotente (pode rodar a cada acesso). */
export function runAtendimentoMigrations(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS atd_conversations (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      phone TEXT NOT NULL,
      contact_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      assigned_staff_id TEXT,
      assigned_staff_name TEXT,
      summary TEXT NOT NULL DEFAULT '',
      handoff_reason TEXT,
      last_message_at TEXT NOT NULL,
      last_message_preview TEXT NOT NULL DEFAULT '',
      last_message_author TEXT,
      unread INTEGER NOT NULL DEFAULT 0,
      waiting_since TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS atd_conversations_phone ON atd_conversations (channel, phone);
    CREATE TABLE IF NOT EXISTS atd_messages (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL REFERENCES atd_conversations (id),
      author TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      delivered_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS atd_messages_conversation ON atd_messages (conversation_id, seq);
    CREATE TABLE IF NOT EXISTS atd_quick_replies (
      id TEXT PRIMARY KEY,
      shortcut TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS atd_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  // v2 (WhatsApp): destino na ponte, id da mensagem no WhatsApp (sem duplicar) e status de envio.
  addColumn(db, "atd_conversations", "wa_chat_id", "TEXT");
  addColumn(db, "atd_messages", "external_id", "TEXT");
  addColumn(db, "atd_messages", "delivery", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "atd_messages", "delivery_error", "TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS atd_messages_external ON atd_messages (external_id) WHERE external_id IS NOT NULL");
  // v3 (mídias): arquivo no disco + tipo, nome original, tamanho e se tem miniatura.
  addColumn(db, "atd_messages", "media_file", "TEXT");
  addColumn(db, "atd_messages", "media_kind", "TEXT");
  addColumn(db, "atd_messages", "media_mime", "TEXT");
  addColumn(db, "atd_messages", "media_name", "TEXT");
  addColumn(db, "atd_messages", "media_size", "INTEGER");
  addColumn(db, "atd_messages", "media_thumb", "INTEGER NOT NULL DEFAULT 0");
  // v4: etiquetas da conversa (lista JSON).
  addColumn(db, "atd_conversations", "tags", "TEXT NOT NULL DEFAULT '[]'");
  // v5: resposta citando outra mensagem.
  addColumn(db, "atd_messages", "reply_to_id", "TEXT");
  // v6: transcrição dos áudios.
  addColumn(db, "atd_messages", "transcript", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "atd_messages", "transcript_status", "TEXT NOT NULL DEFAULT ''");
  // v10: cadastro do site ligado à conversa.
  addColumn(db, "atd_conversations", "customer_ref", "TEXT");
  addColumn(db, "atd_conversations", "customer_name", "TEXT");
  // v9: original apagado pela limpeza automática de mídias.
  addColumn(db, "atd_messages", "media_pruned", "TEXT");
  // v8: evento dos avisos do sistema (relatório da equipe).
  addColumn(db, "atd_messages", "event", "TEXT");
  // v7: anexo nas mensagens rápidas.
  for (const [column, definition] of [["media_file", "TEXT"], ["media_kind", "TEXT"], ["media_mime", "TEXT"], ["media_name", "TEXT"], ["media_size", "INTEGER"], ["media_thumb", "INTEGER NOT NULL DEFAULT 0"]]) {
    addColumn(db, "atd_quick_replies", column, definition);
  }
  // v11: sem a etapa "Aguardando vendedor" (todos respondem): quem estava nela vai para "Em atendimento".
  db.prepare("UPDATE atd_conversations SET status = 'em_atendimento', assigned_staff_id = NULL, assigned_staff_name = NULL WHERE status = 'aguardando_vendedor'").run();
  seedQuickReplies(db);
}

const MEDIA_PREVIEW: Record<MediaKind, string> = { imagem: "📷 Foto", video: "🎥 Vídeo", audio: "🎤 Áudio", documento: "📄 Documento", figurinha: "Figurinha" };

/** Mídias do contato (todas as conversas do mesmo número), da mais antiga para a mais nova. */
export function listContactMedia(db: DatabaseSync, conversationId: string): Array<Message & { mediaFile: string }> {
  const conversation = getConversation(db, conversationId);
  return (db
    .prepare(
      `SELECT m.* FROM atd_messages m JOIN atd_conversations c ON c.id = m.conversation_id
       WHERE c.channel = ? AND c.phone = ? AND m.media_file IS NOT NULL ORDER BY m.created_at, m.seq`,
    )
    .all(conversation.channel, conversation.phone) as ConversationRow[]).map((row) => ({ ...toMessage(row), mediaFile: String(row.media_file) }));
}

/**
 * Mídias de conversa mais antigas que `before` e ainda no disco (quem chamou apaga o original e marca).
 * Mensagens rápidas e pedidos de fotos guardam cópias próprias: não entram aqui.
 */
export function mediaToPrune(db: DatabaseSync, before: Date, limit = 500): Array<{ id: string; file: string; hasThumb: boolean }> {
  return (db
    .prepare("SELECT id, media_file, media_thumb FROM atd_messages WHERE media_file IS NOT NULL AND media_pruned IS NULL AND created_at < ? ORDER BY created_at LIMIT ?")
    .all(before.toISOString(), limit) as ConversationRow[]).map((row) => ({ id: String(row.id), file: String(row.media_file), hasThumb: Number(row.media_thumb ?? 0) === 1 }));
}

export function markMediaPruned(db: DatabaseSync, messageId: string) {
  db.prepare("UPDATE atd_messages SET media_pruned = ? WHERE id = ?").run(nowIso(), messageId);
}

/** Arquivo da mensagem no disco (relativo à pasta de mídias). */
export function mediaFileOf(db: DatabaseSync, messageId: string): { file: string; conversationId: string } | null {
  const row = db.prepare("SELECT media_file, conversation_id FROM atd_messages WHERE id = ? AND media_file IS NOT NULL").get(messageId) as ConversationRow | undefined;
  return row ? { file: String(row.media_file), conversationId: String(row.conversation_id) } : null;
}

function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

type ConversationRow = Record<string, string | number | null>;

function parseTags(value: unknown): string[] {
  try {
    const list: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(list) ? list.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

/** Etiquetas: sem repetir (maiúsculas não contam), até 8 por conversa, 24 letras cada. */
export function normalizeTags(tags: unknown): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const result: string[] = [];
  for (const raw of list) {
    const tag = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
    if (tag && !result.some((existing) => existing.toLowerCase() === tag.toLowerCase())) result.push(tag);
  }
  return result.slice(0, 8);
}

export function setConversationTags(db: DatabaseSync, id: string, tags: unknown): Conversation {
  getConversation(db, id);
  db.prepare("UPDATE atd_conversations SET tags = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(normalizeTags(tags)), nowIso(), id);
  return getConversation(db, id);
}

/** Etiquetas para sugerir: as padrão e todas já usadas (mais usadas primeiro). */
export function knownTags(db: DatabaseSync): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const row of db.prepare("SELECT tags FROM atd_conversations WHERE tags <> '[]'").all() as ConversationRow[]) {
    for (const tag of parseTags(row.tags)) {
      const key = tag.toLowerCase();
      counts.set(key, { tag: counts.get(key)?.tag ?? tag, count: (counts.get(key)?.count ?? 0) + 1 });
    }
  }
  const used = [...counts.values()].sort((a, b) => b.count - a.count).map((entry) => entry.tag);
  const all = [...used, ...DEFAULT_TAGS];
  return all.filter((tag, index) => all.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) === index).slice(0, 40);
}

function toConversation(row: ConversationRow): Conversation {
  const status = String(row.status);
  return {
    id: String(row.id),
    channel: String(row.channel) as Channel,
    phone: String(row.phone),
    waChatId: row.wa_chat_id === null || row.wa_chat_id === undefined ? null : String(row.wa_chat_id),
    contactName: String(row.contact_name ?? ""),
    status: isConversationStatus(status) ? status : "ia",
    assignedStaffId: row.assigned_staff_id === null ? null : String(row.assigned_staff_id),
    assignedStaffName: row.assigned_staff_name === null ? null : String(row.assigned_staff_name),
    summary: String(row.summary ?? ""),
    tags: parseTags(row.tags),
    handoffReason: row.handoff_reason === null ? null : String(row.handoff_reason),
    lastMessageAt: String(row.last_message_at),
    lastMessagePreview: String(row.last_message_preview ?? ""),
    lastMessageAuthor: row.last_message_author === null ? null : (String(row.last_message_author) as AuthorKind),
    unread: Number(row.unread ?? 0),
    waitingSince: row.waiting_since === null ? null : String(row.waiting_since),
    customerRef: row.customer_ref ? String(row.customer_ref) : null,
    // Nome atual do cadastro; o guardado na ligação fica de reserva (cadastro apagado ou tabela ausente).
    customerName: row.customer_ref ? String(row.customer_live_name ?? row.customer_name ?? "") : null,
    customerCompany: row.customer_ref && row.customer_company ? String(row.customer_company) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toMessage(row: ConversationRow): Message {
  return {
    seq: Number(row.seq),
    id: String(row.id),
    conversationId: String(row.conversation_id),
    author: String(row.author) as AuthorKind,
    authorName: String(row.author_name ?? ""),
    body: String(row.body),
    deliveredText: String(row.delivered_text ?? ""),
    delivery: (String(row.delivery ?? "") as Message["delivery"]) || "",
    deliveryError: row.delivery_error === null || row.delivery_error === undefined ? null : String(row.delivery_error),
    media: row.media_file
      ? {
          kind: String(row.media_kind) as MediaKind,
          mime: String(row.media_mime ?? ""),
          name: String(row.media_name ?? ""),
          size: Number(row.media_size ?? 0),
          hasThumb: Number(row.media_thumb ?? 0) === 1,
          ...(row.media_pruned ? { pruned: true } : {}),
        }
      : null,
    replyToId: row.reply_to_id === null || row.reply_to_id === undefined ? null : String(row.reply_to_id),
    transcript: String(row.transcript ?? ""),
    transcriptStatus: (String(row.transcript_status ?? "") as Message["transcriptStatus"]) || "",
    createdAt: String(row.created_at),
  };
}

export function createConversation(db: DatabaseSync, input: { channel: Channel; phone: string; contactName?: string; waChatId?: string }): Conversation {
  const phone = phoneDigits(input.phone);
  if (phone.length < 8) throw new AtendimentoError("INVALID_REQUEST", "Telefone inválido.");
  const at = nowIso();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO atd_conversations (id, channel, phone, wa_chat_id, contact_name, status, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ia', ?, ?, ?)`,
  ).run(id, input.channel, phone, input.waChatId ?? null, (input.contactName ?? "").trim().slice(0, 80), at, at, at);
  return getConversation(db, id);
}

/** Conversa do WhatsApp deste contato (pelo destino da ponte ou pelo telefone); atualiza o destino se mudou. */
export function findWhatsAppConversation(db: DatabaseSync, waChatId: string, phone: string): Conversation | null {
  const row = db
    .prepare("SELECT * FROM atd_conversations WHERE channel = 'whatsapp' AND (wa_chat_id = ? OR phone = ?) ORDER BY last_message_at DESC LIMIT 1")
    .get(waChatId, phoneDigits(phone)) as ConversationRow | undefined;
  if (!row) return null;
  if (row.wa_chat_id !== waChatId) db.prepare("UPDATE atd_conversations SET wa_chat_id = ? WHERE id = ?").run(waChatId, row.id);
  return getConversation(db, String(row.id));
}

export function messageByExternalId(db: DatabaseSync, externalId: string): Message | null {
  const row = db.prepare("SELECT * FROM atd_messages WHERE external_id = ?").get(externalId) as ConversationRow | undefined;
  return row ? toMessage(row) : null;
}

export function setTranscript(db: DatabaseSync, messageId: string, status: Message["transcriptStatus"], text = "") {
  db.prepare("UPDATE atd_messages SET transcript = ?, transcript_status = ? WHERE id = ?").run(text.slice(0, 4000), status, messageId);
}

/** Transcrições recentes (mudam depois que o áudio já apareceu na conversa). */
export function recentTranscripts(db: DatabaseSync, conversationId: string): Array<Pick<Message, "id" | "transcript" | "transcriptStatus">> {
  return (db
    .prepare("SELECT id, transcript, transcript_status FROM atd_messages WHERE conversation_id = ? AND transcript_status <> '' ORDER BY seq DESC LIMIT 30")
    .all(conversationId) as ConversationRow[]).map((row) => ({
    id: String(row.id),
    transcript: String(row.transcript ?? ""),
    transcriptStatus: String(row.transcript_status) as Message["transcriptStatus"],
  }));
}

export function recentDeliveries(db: DatabaseSync, conversationId: string): Array<Pick<Message, "id" | "delivery" | "deliveryError">> {
  return (db
    .prepare("SELECT id, delivery, delivery_error FROM atd_messages WHERE conversation_id = ? AND delivery <> '' ORDER BY seq DESC LIMIT 30")
    .all(conversationId) as ConversationRow[]).map((row) => ({
    id: String(row.id),
    delivery: String(row.delivery) as Message["delivery"],
    deliveryError: row.delivery_error === null ? null : String(row.delivery_error),
  }));
}

/** Id da mensagem no WhatsApp (para citar). */
export function externalIdOf(db: DatabaseSync, messageId: string): string | null {
  const row = db.prepare("SELECT external_id FROM atd_messages WHERE id = ?").get(messageId) as ConversationRow | undefined;
  return row?.external_id ? String(row.external_id) : null;
}

export function getMessage(db: DatabaseSync, id: string): Message | null {
  const row = db.prepare("SELECT * FROM atd_messages WHERE id = ?").get(id) as ConversationRow | undefined;
  return row ? toMessage(row) : null;
}

/** Status de envio ao WhatsApp (e o id que o WhatsApp devolveu). */
export function setDelivery(db: DatabaseSync, messageId: string, delivery: Message["delivery"], details: { error?: string | null; externalId?: string | null } = {}) {
  db.prepare("UPDATE atd_messages SET delivery = ?, delivery_error = ?, external_id = COALESCE(?, external_id) WHERE id = ?").run(
    delivery,
    details.error ? details.error.slice(0, 300) : null,
    details.externalId ?? null,
    messageId,
  );
}

const hasTable = (db: DatabaseSync, name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

/** SELECT das conversas com a empresa do cadastro ligado (painel ou conta), lida na hora para não ficar desatualizada. */
/** Empresa e nome lidos na hora do cadastro ligado (editar o cadastro já muda o que o Atendimento mostra). */
export function conversationsSelect(db: DatabaseSync) {
  const ref = "atd_conversations.customer_ref";
  const painel = hasTable(db, "fare_panel_customers");
  const perfil = hasTable(db, "fare_customer_profiles");
  const conta = hasTable(db, "user");
  const pick = (painelSql: string | false, contaSql: string | false) => {
    const cases = [painelSql ? `WHEN ${ref} LIKE 'painel:%' THEN (${painelSql})` : "", contaSql ? `WHEN ${ref} LIKE 'conta:%' THEN (${contaSql})` : ""].join(" ").trim();
    return cases ? `CASE ${cases} END` : "NULL";
  };
  const company = pick(
    painel && `SELECT NULLIF(company, '') FROM fare_panel_customers WHERE id = substr(${ref}, 8)`,
    perfil && `SELECT COALESCE(NULLIF(company_name, ''), NULLIF(trade_name, '')) FROM fare_customer_profiles WHERE user_id = substr(${ref}, 7)`,
  );
  const name = pick(
    painel && `SELECT NULLIF(TRIM(name), '') FROM fare_panel_customers WHERE id = substr(${ref}, 8)`,
    conta && `SELECT NULLIF(TRIM(name), '') FROM user WHERE id = substr(${ref}, 7)`,
  );
  return `SELECT *, ${company} AS customer_company, ${name} AS customer_live_name FROM atd_conversations`;
}

export function findConversation(db: DatabaseSync, id: string): Conversation | null {
  const row = db.prepare(`${conversationsSelect(db)} WHERE id = ?`).get(id) as ConversationRow | undefined;
  return row ? toConversation(row) : null;
}

export function getConversation(db: DatabaseSync, id: string): Conversation {
  const conversation = findConversation(db, id);
  if (!conversation) throw new AtendimentoError("CONVERSATION_NOT_FOUND", "Conversa não encontrada.");
  return conversation;
}

/** Conversa aberta mais recente deste número (WhatsApp manda tudo do mesmo número para a mesma conversa). */
export function findConversationByPhone(db: DatabaseSync, channel: Channel, phone: string): Conversation | null {
  const row = db
    .prepare(`${conversationsSelect(db)} WHERE channel = ? AND phone = ? ORDER BY last_message_at DESC LIMIT 1`)
    .get(channel, phoneDigits(phone)) as ConversationRow | undefined;
  return row ? toConversation(row) : null;
}

export function listConversations(db: DatabaseSync, options: { channel?: Channel } = {}): Conversation[] {
  const rows = (options.channel
    ? db.prepare(`${conversationsSelect(db)} WHERE channel = ? ORDER BY last_message_at DESC`).all(options.channel)
    : db.prepare(`${conversationsSelect(db)} ORDER BY last_message_at DESC`).all()) as ConversationRow[];
  return rows.map(toConversation);
}

export function listMessages(db: DatabaseSync, conversationId: string, afterSeq = 0): Message[] {
  return (db
    .prepare("SELECT * FROM atd_messages WHERE conversation_id = ? AND seq > ? ORDER BY seq")
    .all(conversationId, afterSeq) as ConversationRow[]).map(toMessage);
}

export function addMessage(
  db: DatabaseSync,
  input: {
    conversationId: string;
    author: AuthorKind;
    authorName?: string;
    body: string;
    deliveredText?: string;
    externalId?: string;
    delivery?: Message["delivery"];
    media?: { file: string; kind: MediaKind; mime: string; name: string; size: number; hasThumb: boolean };
    replyToId?: string | null;
  },
): Message {
  const body = input.body.trim();
  if (!body && !input.media) throw new AtendimentoError("INVALID_REQUEST", "Mensagem vazia.");
  const at = nowIso();
  const id = randomUUID();
  const delivered = isInternal(input.author) ? "" : (input.deliveredText ?? body);
  db.prepare(
    "INSERT INTO atd_messages (id, conversation_id, author, author_name, body, delivered_text, external_id, delivery, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, input.conversationId, input.author, input.authorName ?? "", body.slice(0, 4000), delivered.slice(0, 4200), input.externalId ?? null, input.delivery ?? "", at);
  if (input.replyToId) {
    // Só cita mensagem do mesmo contato (mesmo canal e telefone).
    const quoted = db
      .prepare(
        `SELECT m.id FROM atd_messages m JOIN atd_conversations q ON q.id = m.conversation_id JOIN atd_conversations c ON c.id = ?
         WHERE m.id = ? AND q.channel = c.channel AND q.phone = c.phone`,
      )
      .get(input.conversationId, input.replyToId);
    if (quoted) db.prepare("UPDATE atd_messages SET reply_to_id = ? WHERE id = ?").run(input.replyToId, id);
  }
  if (input.media) {
    db.prepare("UPDATE atd_messages SET media_file = ?, media_kind = ?, media_mime = ?, media_name = ?, media_size = ?, media_thumb = ? WHERE id = ?").run(
      input.media.file,
      input.media.kind,
      input.media.mime,
      input.media.name.slice(0, 160),
      input.media.size,
      input.media.hasThumb ? 1 : 0,
      id,
    );
  }
  if (!isInternal(input.author)) {
    // "Não lidas" só conta o que a equipe precisa ler: enquanto a IA atende, ela mesma responde.
    db.prepare(
      `UPDATE atd_conversations SET last_message_at = ?, last_message_preview = ?, last_message_author = ?, updated_at = ?,
         unread = unread + (CASE WHEN ? = 1 AND status <> 'ia' THEN 1 ELSE 0 END) WHERE id = ?`,
    ).run(at, (body || MEDIA_PREVIEW[input.media!.kind]).replace(/\s+/g, " ").slice(0, 140), input.author, at, input.author === "cliente" ? 1 : 0, input.conversationId);
  } else {
    db.prepare("UPDATE atd_conversations SET updated_at = ? WHERE id = ?").run(at, input.conversationId);
  }
  const row = db.prepare("SELECT * FROM atd_messages WHERE id = ?").get(id) as ConversationRow;
  return toMessage(row);
}

export function markConversationRead(db: DatabaseSync, id: string) {
  db.prepare("UPDATE atd_conversations SET unread = 0 WHERE id = ?").run(id);
}

/** "Marcar todas como lidas": zera a bolinha de todas as conversas. */
export function markAllConversationsRead(db: DatabaseSync) {
  db.prepare("UPDATE atd_conversations SET unread = 0 WHERE unread > 0").run();
}

/** "Marcar como não lida" (como no WhatsApp): volta a bolinha para lembrar a equipe. */
export function markConversationUnread(db: DatabaseSync, id: string) {
  getConversation(db, id);
  db.prepare("UPDATE atd_conversations SET unread = MAX(unread, 1) WHERE id = ?").run(id);
}

export function setConversationCustomer(db: DatabaseSync, id: string, ref: string, name: string) {
  db.prepare("UPDATE atd_conversations SET customer_ref = ?, customer_name = ?, updated_at = ? WHERE id = ?").run(ref, name.slice(0, 120), nowIso(), id);
}

export function updateConversationProfile(db: DatabaseSync, id: string, input: { contactName?: string; summary?: string }) {
  const current = getConversation(db, id);
  db.prepare("UPDATE atd_conversations SET contact_name = ?, summary = ?, updated_at = ? WHERE id = ?").run(
    (input.contactName ?? current.contactName).trim().slice(0, 80),
    (input.summary ?? current.summary).trim().slice(0, 600),
    nowIso(),
    id,
  );
}

function setStatus(
  db: DatabaseSync,
  id: string,
  status: ConversationStatus,
  fields: { staff?: StaffActor | null; handoffReason?: string | null; waiting?: boolean },
) {
  const at = nowIso();
  db.prepare(
    `UPDATE atd_conversations SET status = ?, assigned_staff_id = ?, assigned_staff_name = ?,
       handoff_reason = ?, waiting_since = ?, updated_at = ? WHERE id = ?`,
  ).run(
    status,
    fields.staff?.id ?? null,
    fields.staff?.name ?? null,
    fields.handoffReason ?? null,
    fields.waiting ? at : null,
    at,
    id,
  );
}

/** Evento do aviso do sistema (para o relatório da equipe). */
export type SystemEvent = "fila" | "assumiu" | "finalizou" | "devolveu" | "moveu" | "cliente_respondeu" | "celular" | "reabriu";
const system = (db: DatabaseSync, conversationId: string, body: string, event: SystemEvent, staff?: StaffActor | null) => {
  const message = addMessage(db, { conversationId, author: "sistema", body, authorName: staff?.name });
  db.prepare("UPDATE atd_messages SET event = ? WHERE id = ?").run(event, message.id);
  return message;
};

/** Volta para "Em atendimento" (a IA para de responder). Qualquer pessoa da equipe pode: todos respondem o mesmo cliente. */
export function assumeConversation(db: DatabaseSync, id: string, staff: StaffActor): Conversation {
  const current = getConversation(db, id);
  if (current.status === "em_atendimento") return current;
  setStatus(db, id, "em_atendimento", { staff, handoffReason: current.handoffReason });
  system(
    db,
    id,
    current.status === "ia" ? `${staff.name} entrou na conversa. A IA parou de responder.` : `${staff.name} moveu para Em atendimento.`,
    "assumiu",
    staff,
  );
  return getConversation(db, id);
}

/** A equipe vai responder: conversa com a IA ou finalizada passa para "Em atendimento"; as outras etapas ficam como estão. */
export function openForStaff(db: DatabaseSync, id: string, staff: StaffActor): Conversation {
  const current = getConversation(db, id);
  return current.status === "ia" || current.status === "finalizada" ? assumeConversation(db, id, staff) : current;
}

/** Aguardando orçamento / Aguardando cliente: a IA segue calada; qualquer pessoa da equipe move. */
export function setSellerStage(db: DatabaseSync, id: string, stage: "aguardando_orcamento" | "aguardando_cliente", staff: StaffActor): Conversation {
  const current = getConversation(db, id);
  if (current.status === stage) return current;
  setStatus(db, id, stage, { staff, handoffReason: current.handoffReason });
  system(db, id, `${staff.name} moveu para ${CONVERSATION_STATUS_LABELS[stage]}.`, "moveu", staff);
  return getConversation(db, id);
}

/** Cliente respondeu enquanto estava em "Aguardando cliente": volta para "Em atendimento" com o mesmo vendedor. */
export function customerReplied(db: DatabaseSync, id: string) {
  const current = getConversation(db, id);
  if (current.status !== "aguardando_cliente") return;
  db.prepare("UPDATE atd_conversations SET status = 'em_atendimento', updated_at = ? WHERE id = ?").run(nowIso(), id);
  system(db, id, "O cliente respondeu. A conversa voltou para Em atendimento.", "cliente_respondeu");
}

/** Devolve para a IA (com um recado opcional que entra no resumo para a IA continuar do ponto certo). */
export function returnToAi(db: DatabaseSync, id: string, staff: StaffActor, note = ""): Conversation {
  const current = getConversation(db, id);
  const cleanNote = note.trim().slice(0, 400);
  setStatus(db, id, "ia", { staff: null });
  if (cleanNote) updateConversationProfile(db, id, { summary: `${current.summary}${current.summary ? "\n" : ""}Vendedor: ${cleanNote}` });
  system(db, id, `${staff.name} devolveu a conversa para a IA.${cleanNote ? ` Recado: ${cleanNote}` : ""}`, "devolveu", staff);
  return getConversation(db, id);
}

/** A IA pediu um vendedor: vai para "Em atendimento" como não lida (o evento "fila" mede a espera no relatório). */
export function handOffToStaff(db: DatabaseSync, id: string, reason: string): Conversation {
  const current = getConversation(db, id);
  if (current.status !== "ia") return current;
  setStatus(db, id, "em_atendimento", { staff: null, handoffReason: reason, waiting: true });
  db.prepare("UPDATE atd_conversations SET unread = MAX(unread, 1) WHERE id = ?").run(id);
  system(db, id, `A IA pediu um vendedor: ${reason}`, "fila");
  return getConversation(db, id);
}

/** IA respondendo clientes: ligada/desligada pelo painel (começa DESLIGADA: só vendedores respondem). */
export function aiEnabled(db: DatabaseSync) {
  return (db.prepare("SELECT value FROM atd_meta WHERE key = 'ia_ligada'").get() as { value?: string } | undefined)?.value === "1";
}

export function setAiEnabled(db: DatabaseSync, enabled: boolean) {
  db.prepare("INSERT INTO atd_meta (key, value) VALUES ('ia_ligada', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(enabled ? "1" : "0");
}

/**
 * Cliente escreveu e a IA não deve responder: vai direto para "Em atendimento" (não lida).
 * Padrão: IA desligada. Com `reason`: regra do atendimento (pedido em aberto, cliente na loja…). Vale para conversa com a IA ou finalizada.
 */
export function holdForSeller(db: DatabaseSync, id: string, reason?: string): Conversation {
  const current = getConversation(db, id);
  if (current.status !== "ia" && current.status !== "finalizada") return current;
  setStatus(db, id, "em_atendimento", { staff: null, handoffReason: reason ?? "Cliente escreveu (IA desligada)", waiting: true });
  db.prepare("UPDATE atd_conversations SET unread = MAX(unread, 1) WHERE id = ?").run(id);
  system(db, id, reason ? `${reason}. A IA não responde: a conversa foi para Em atendimento.` : "IA desligada: a conversa foi para Em atendimento.", "fila");
  return getConversation(db, id);
}

export function finishConversation(db: DatabaseSync, id: string, staff: StaffActor): Conversation {
  const current = getConversation(db, id);
  if (current.status === "finalizada") return current;
  setStatus(db, id, "finalizada", { staff: null });
  system(db, id, `${staff.name} finalizou o atendimento.`, "finalizou", staff);
  return getConversation(db, id);
}

/**
 * Alguém respondeu pelo celular (app do WhatsApp Business). A IA para de responder:
 * a conversa vai para "Em atendimento". Se já está com a equipe, nada muda.
 */
export function phoneReplied(db: DatabaseSync, id: string): Conversation {
  const current = getConversation(db, id);
  if (current.status !== "ia" && current.status !== "finalizada") return current;
  setStatus(db, id, "em_atendimento", { staff: null, handoffReason: "Respondido pelo celular" });
  system(db, id, "Alguém respondeu pelo celular. A IA parou; a conversa está em Em atendimento.", "celular");
  return getConversation(db, id);
}

/** Cliente voltou a escrever numa conversa finalizada: reabre com a IA. */
export function reopenConversation(db: DatabaseSync, id: string) {
  setStatus(db, id, "ia", { staff: null });
  system(db, id, "O cliente voltou a escrever. Conversa reaberta com a IA.", "reabriu");
}

/** Arrastar no quadro: cada coluna de destino vira a ação correspondente. */
export function moveConversation(db: DatabaseSync, id: string, target: ConversationStatus, staff: StaffActor) {
  if (target === "em_atendimento") return assumeConversation(db, id, staff);
  if (target === "ia") return returnToAi(db, id, staff);
  if (target === "aguardando_orcamento" || target === "aguardando_cliente") return setSellerStage(db, id, target, staff);
  return finishConversation(db, id, staff);
}

// ---------- Mensagens rápidas ----------

const DEFAULT_QUICK_REPLIES: Array<Pick<QuickReply, "shortcut" | "title" | "body">> = [
  { shortcut: "ola", title: "Saudação", body: "Olá! Aqui é da Fare Foto. Como posso te ajudar?" },
  { shortcut: "horario", title: "Horário da loja", body: "Nosso horário é de segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 13h. Fechamos aos domingos e feriados." },
  { shortcut: "endereco", title: "Endereço", body: "Estamos na Rua do Rosário, 68, Centro, Jundiaí/SP." },
  { shortcut: "3x4", title: "Foto 3x4", body: "A foto 3x4 sai em pacote de 6 fotos por R$ 30,00. Fazemos na hora, sem agendamento, durante o horário da loja." },
  {
    shortcut: "documentos",
    title: "Fotos para documentos",
    body: "Fotos para documentos (tiradas na loja, na hora):\n• 3x4: 6 fotos por R$ 30,00\n• Visto americano 5x5: 4 fotos por R$ 35,00\n• Passaporte brasileiro 5x7: 4 fotos por R$ 35,00\n• Passaporte italiano 3,5x4,5: 6 fotos por R$ 35,00",
  },
  {
    shortcut: "revelacao",
    title: "Revelação de fotos",
    body: "Para revelar, envie as fotos em qualidade original pelo site: https://www.farefoto.com.br/produtos/revelacao-de-fotos\nValor por foto em 10x15 ou 9x12: 1 foto R$ 6,00 · 2 a 9 R$ 3,50 · 10 a 50 R$ 3,00 · 51 a 100 R$ 2,50 · 101 a 250 R$ 1,80.",
  },
  { shortcut: "brindes", title: "Orçamento de brindes", body: "Para montar seu orçamento de brindes, me conta: qual produto, a quantidade, para quando precisa e se já tem o logo?" },
  { shortcut: "grafica", title: "Orçamento de gráfica", body: "Para orçar seu impresso, preciso de: quantidade, medidas, data desejada e se você já tem a arte pronta." },
  { shortcut: "pronto", title: "Pedido pronto", body: "Seu pedido está pronto para retirada! Estamos na Rua do Rosário, 68, Centro, Jundiaí/SP — seg. a sex. das 9h às 18h e sáb. das 9h às 13h." },
  { shortcut: "obrigado", title: "Agradecimento", body: "Obrigado pelo contato! Qualquer coisa, é só chamar por aqui." },
];

/** Texto do /pix antes do cartão do Pix: só é trocado se a equipe não tiver mudado. */
const PREVIOUS_PIX_BODY =
  "*Pagamento via Pix*\nChave Pix (CNPJ): *50.344.377/0001-36*\n\nVou te mandar a chave sozinha na próxima mensagem para você copiar. Depois de pagar, envie o comprovante por aqui, por favor.";
/** /pix = mensagem do sistema antigo de WhatsApp + {pix} (cartão com o botão "Copiar chave Pix"). /chavepix manda só a chave. */
const PIX_REPLY = {
  shortcut: "pix",
  title: "Pagamento por Pix",
  body: `📍Fare Foto - R. do Rosário, 68 Centro, Jundiaí - SP, 13201-014\n\n⚠️ O pedido é confirmado após o envio do comprovante\n\n📦 Para retirada, apresente o comprovante de pagamento e informe o tipo de serviço encomendado.\n\nSegue os nossos dados para pagamento:\n${PIX_TOKEN}`,
};
const PIX_QUICK_REPLIES: Array<Pick<QuickReply, "shortcut" | "title" | "body">> = [
  PIX_REPLY,
  { shortcut: "chavepix", title: "Chave Pix (só a chave, para copiar)", body: "50344377000136" },
];

/** Saudações do sistema antigo de WhatsApp; {saudacao} e {nome} são preenchidos no painel (quickReplyFill.ts). */
const GREETING_QUICK_REPLIES: Array<Pick<QuickReply, "shortcut" | "title" | "body">> = [
  { shortcut: "bem", title: "Tudo bem?", body: "{saudacao}, {nome}, tudo bem?" },
  { shortcut: "sim", title: "Tudo sim e você?", body: "{saudacao}, {nome}, tudo sim e você?" },
  { shortcut: "ajudar", title: "Como posso ajudar?", body: "Como posso ajudar?" },
];

/** Cada leva de mensagens iniciais entra uma única vez; apagar/editar depois é decisão da equipe. */
const QUICK_REPLY_SEEDS: Array<[string, Array<Pick<QuickReply, "shortcut" | "title" | "body">>]> = [
  ["quick_replies_seeded", DEFAULT_QUICK_REPLIES],
  ["quick_replies_seed_pix", PIX_QUICK_REPLIES],
  ["quick_replies_seed_saudacao", GREETING_QUICK_REPLIES],
];

function seedQuickReplies(db: DatabaseSync) {
  const insert = db.prepare("INSERT OR IGNORE INTO atd_quick_replies (id, shortcut, title, body, updated_at) VALUES (?, ?, ?, ?, ?)");
  for (const [key, replies] of QUICK_REPLY_SEEDS) {
    if (db.prepare("SELECT value FROM atd_meta WHERE key = ?").get(key)) continue;
    const at = nowIso();
    for (const reply of replies) insert.run(randomUUID(), reply.shortcut, reply.title, reply.body, at);
    db.prepare("INSERT INTO atd_meta (key, value) VALUES (?, ?)").run(key, at);
  }
  if (!db.prepare("SELECT value FROM atd_meta WHERE key = 'quick_replies_pix_card'").get()) {
    const at = nowIso();
    db.prepare("UPDATE atd_quick_replies SET body = ?, updated_at = ? WHERE shortcut = 'pix' AND body = ?").run(PIX_REPLY.body, at, PREVIOUS_PIX_BODY);
    db.prepare("INSERT INTO atd_meta (key, value) VALUES ('quick_replies_pix_card', ?)").run(at);
  }
}

const cleanShortcut = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^\/+/, "").replace(/[^a-z0-9_-]/g, "").slice(0, 30);

function mediaOfRow(row: ConversationRow): QuickReply["media"] {
  return row.media_file
    ? { kind: String(row.media_kind) as MediaKind, mime: String(row.media_mime ?? ""), name: String(row.media_name ?? ""), size: Number(row.media_size ?? 0), hasThumb: Number(row.media_thumb ?? 0) === 1 }
    : null;
}

const toQuickReply = (row: ConversationRow): QuickReply => ({
  id: String(row.id),
  shortcut: String(row.shortcut),
  title: String(row.title),
  body: String(row.body),
  media: mediaOfRow(row),
  updatedAt: String(row.updated_at),
});

export function listQuickReplies(db: DatabaseSync): QuickReply[] {
  return (db.prepare("SELECT * FROM atd_quick_replies ORDER BY shortcut").all() as ConversationRow[]).map(toQuickReply);
}

export function getQuickReply(db: DatabaseSync, id: string): QuickReply & { mediaFile: string | null } {
  const row = db.prepare("SELECT * FROM atd_quick_replies WHERE id = ?").get(id) as ConversationRow | undefined;
  if (!row) throw new AtendimentoError("QUICK_REPLY_NOT_FOUND", "Mensagem rápida não encontrada.");
  return { ...toQuickReply(row), mediaFile: row.media_file ? String(row.media_file) : null };
}

/** Troca (ou tira, com null) o anexo da mensagem rápida. Devolve o arquivo antigo para apagar do disco. */
export function setQuickReplyMedia(db: DatabaseSync, id: string, media: { file: string; kind: MediaKind; mime: string; name: string; size: number; hasThumb: boolean } | null) {
  const old = getQuickReply(db, id).mediaFile;
  db.prepare("UPDATE atd_quick_replies SET media_file = ?, media_kind = ?, media_mime = ?, media_name = ?, media_size = ?, media_thumb = ?, updated_at = ? WHERE id = ?").run(
    media?.file ?? null,
    media?.kind ?? null,
    media?.mime ?? null,
    media?.name.slice(0, 160) ?? null,
    media?.size ?? null,
    media?.hasThumb ? 1 : 0,
    nowIso(),
    id,
  );
  return { quickReply: getQuickReply(db, id), oldFile: old };
}

function validateQuickReply(input: { shortcut: string; title: string; body: string }) {
  const shortcut = cleanShortcut(input.shortcut);
  const title = input.title.trim().slice(0, 60);
  const body = input.body.trim().slice(0, 2000);
  if (!shortcut || !title || !body) throw new AtendimentoError("INVALID_REQUEST", "Preencha atalho, título e texto.");
  return { shortcut, title, body };
}

export function saveQuickReply(db: DatabaseSync, input: { id?: string; shortcut: string; title: string; body: string }): QuickReply {
  const clean = validateQuickReply(input);
  const clash = db.prepare("SELECT id FROM atd_quick_replies WHERE shortcut = ?").get(clean.shortcut) as { id: string } | undefined;
  if (clash && clash.id !== input.id) throw new AtendimentoError("DUPLICATE_SHORTCUT", `Já existe uma mensagem com o atalho /${clean.shortcut}.`);
  const at = nowIso();
  if (input.id) {
    const result = db
      .prepare("UPDATE atd_quick_replies SET shortcut = ?, title = ?, body = ?, updated_at = ? WHERE id = ?")
      .run(clean.shortcut, clean.title, clean.body, at, input.id);
    if (!result.changes) throw new AtendimentoError("QUICK_REPLY_NOT_FOUND", "Mensagem rápida não encontrada.");
    return getQuickReply(db, input.id);
  }
  const id = randomUUID();
  db.prepare("INSERT INTO atd_quick_replies (id, shortcut, title, body, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, clean.shortcut, clean.title, clean.body, at);
  return getQuickReply(db, id);
}

/** Apaga a mensagem rápida; devolve o anexo (se havia) para apagar do disco. */
export function deleteQuickReply(db: DatabaseSync, id: string): string | null {
  const old = getQuickReply(db, id).mediaFile;
  db.prepare("DELETE FROM atd_quick_replies WHERE id = ?").run(id);
  return old;
}
