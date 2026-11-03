import type { DatabaseSync } from "node:sqlite";

/**
 * Relatório da equipe de atendimento, calculado das mensagens:
 *   - volume (conversas, mensagens de clientes, respostas da IA e da equipe);
 *   - quantas a IA resolveu sozinha;
 *   - pedidos de vendedor e quanto tempo o cliente esperou até um vendedor responder;
 *   - por vendedor: mensagens, conversas, pedidos atendidos, tempo médio, finalizadas;
 *   - clientes que esperaram mais de 10 minutos (ou ainda esperam);
 *   - horários com mais mensagens de clientes.
 */
export const TIME_ZONE = "America/Sao_Paulo";
export const LONG_WAIT_MINUTES = 10;

type Row = {
  id: string;
  conversation_id: string;
  author: string;
  author_name: string;
  body: string;
  event: string | null;
  created_at: string;
  contact_name: string;
  phone: string;
  status: string;
};

/** Evento do aviso (antigos não têm a coluna: deduz pelo texto). */
function eventOf(row: Row): string | null {
  if (row.author !== "sistema") return null;
  if (row.event) return row.event;
  if (/^A IA pediu um vendedor|colocou a conversa na fila/.test(row.body)) return "fila";
  if (/ finalizou o atendimento\.$/.test(row.body)) return "finalizou";
  if (/ assumiu a conversa/.test(row.body)) return "assumiu";
  return null;
}

const hourIn = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));

/** Início do dia de hoje em São Paulo. */
export function startOfTodaySp(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return new Date(now.getTime() - ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 - now.getMilliseconds());
}

const minutesBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / 60000;
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

export type TeamReport = ReturnType<typeof teamReport>;

export function teamReport(db: DatabaseSync, period: { from: Date; to?: Date }) {
  const from = period.from.toISOString();
  const to = (period.to ?? new Date()).toISOString();
  // Mensagens do período + as seguintes (a resposta a um pedido do fim do período pode vir depois).
  const rows = db
    .prepare(
      `SELECT m.id, m.conversation_id, m.author, m.author_name, m.body, m.event, m.created_at, c.contact_name, c.phone, c.status
       FROM atd_messages m JOIN atd_conversations c ON c.id = m.conversation_id
       WHERE m.created_at >= ? ORDER BY m.conversation_id, m.seq`,
    )
    .all(from) as Row[];
  const inPeriod = (row: Row) => row.created_at >= from && row.created_at <= to;

  const conversations = new Set<string>();
  const withStaff = new Set<string>();
  const withHandoff = new Set<string>();
  const hours = new Array<number>(24).fill(0);
  let customerMessages = 0;
  let aiMessages = 0;
  let staffMessages = 0;
  const sellers = new Map<string, { name: string; messages: number; conversations: Set<string>; waits: number[]; finished: number }>();
  const seller = (name: string) => {
    const key = name || "Equipe";
    if (!sellers.has(key)) sellers.set(key, { name: key, messages: 0, conversations: new Set(), waits: [], finished: 0 });
    return sellers.get(key)!;
  };
  const waits: number[] = [];
  let unanswered = 0;
  const longWaits: Array<{ conversationId: string; contact: string; askedAt: string; minutes: number; answeredBy: string | null; waiting: boolean }> = [];
  const now = new Date().toISOString();

  const byConversation = new Map<string, Row[]>();
  for (const row of rows) byConversation.set(row.conversation_id, [...(byConversation.get(row.conversation_id) ?? []), row]);

  for (const [conversationId, list] of byConversation) {
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      if (!inPeriod(row)) continue;
      if (row.author === "cliente") {
        conversations.add(conversationId);
        customerMessages += 1;
        hours[hourIn(row.created_at)] += 1;
      } else if (row.author === "ia") {
        aiMessages += 1;
      } else if (row.author === "vendedor") {
        staffMessages += 1;
        withStaff.add(conversationId);
        const entry = seller(row.author_name);
        entry.messages += 1;
        entry.conversations.add(conversationId);
      }
      const event = eventOf(row);
      if (event === "finalizou") seller(row.author_name || row.body.replace(/ finalizou o atendimento\.$/, "")).finished += 1;
      if (event !== "fila") continue;
      // Pedido de vendedor: espera até a próxima mensagem da equipe (painel ou celular).
      withHandoff.add(conversationId);
      const answer = list.slice(index + 1).find((next) => next.author === "vendedor");
      const contact = row.contact_name || row.phone;
      if (answer) {
        const minutes = minutesBetween(row.created_at, answer.created_at);
        waits.push(minutes);
        seller(answer.author_name).waits.push(minutes);
        if (minutes > LONG_WAIT_MINUTES) longWaits.push({ conversationId, contact, askedAt: row.created_at, minutes: round1(minutes)!, answeredBy: answer.author_name || "Equipe", waiting: false });
      } else if (row.status === "aguardando_vendedor") {
        unanswered += 1;
        const minutes = minutesBetween(row.created_at, now);
        if (minutes > LONG_WAIT_MINUTES) longWaits.push({ conversationId, contact, askedAt: row.created_at, minutes: round1(minutes)!, answeredBy: null, waiting: true });
      }
    }
  }

  const waitingNow = db.prepare("SELECT COUNT(*) AS total FROM atd_conversations WHERE status = 'aguardando_vendedor'").get() as { total: number };
  const resolvedByAi = [...conversations].filter((id) => !withStaff.has(id) && !withHandoff.has(id)).length;
  return {
    from,
    to,
    totals: {
      conversations: conversations.size,
      customerMessages,
      aiMessages,
      staffMessages,
      resolvedByAi,
      resolvedByAiPercent: conversations.size ? Math.round((resolvedByAi / conversations.size) * 100) : null,
      handoffs: waits.length + unanswered,
      waitAverageMinutes: round1(average(waits)),
      waitMedianMinutes: round1(median(waits)),
      waitMaxMinutes: round1(waits.length ? Math.max(...waits) : null),
      waitingNow: Number(waitingNow.total),
    },
    sellers: [...sellers.values()]
      .map((entry) => ({
        name: entry.name,
        messages: entry.messages,
        conversations: entry.conversations.size,
        handoffsAnswered: entry.waits.length,
        waitAverageMinutes: round1(average(entry.waits)),
        finished: entry.finished,
      }))
      .sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name, "pt-BR")),
    longWaits: longWaits.sort((a, b) => b.minutes - a.minutes).slice(0, 50),
    hours,
  };
}
