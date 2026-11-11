import type { DatabaseSync } from "node:sqlite";
import { addMessage, findConversationByPhone, getMessage, runAtendimentoMigrations, updateConversationProfile } from "@/lib/atendimento/repository";
import { REAL_AI_NAME } from "@/lib/atendimento/hermesBrain";
import { AVISO_APOS_MS } from "@/lib/backoffice/finishedOrders";
import { bridgeConfig, deliverToWhatsApp, normalizeOutboundPhone, whatsAppConversationFor } from "@/lib/atendimento/whatsapp";
import { orderCode } from "@/lib/orders/orderCode";
import { getOrderFinance, type OrderFinance } from "@/lib/orders/payments";
import { dueAtPickupCents } from "@/lib/orders/paymentPlan";
import { findOrderById, runOrderMigrations, type Order } from "@/lib/orders/repository";

/**
 * Aviso de pedido pronto no WhatsApp: 5 min depois de o pedido entrar em Finalizado (`aguardando_retirada`),
 * a IA manda ao cliente o número, os itens e como retirar (ou que vai ser entregue). Uma vez por pedido;
 * aparece na conversa do Atendimento. Saiu de Finalizado antes dos 5 min (engano): não manda.
 */
export type PickupNotice = { state: "enviando" | "enviado" | "falhou" | "pulado"; detail: string | null; at: string };

const LOJA_ENDERECO = "Rua do Rosário, 68, Centro, Jundiaí/SP";
const LOJA_HORARIO = "Seg a sex 9h às 18h, sáb 9h às 13h";
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");

export function pickupNoticeText(order: Pick<Order, "id" | "customer" | "items">, finance: OrderFinance | null): string {
  const number = orderCode(order.id).replace(/^PED-/, "");
  const first = order.customer.name.trim().split(/\s+/)[0] ?? "";
  const delivery = finance?.deliveryMode === "entrega";
  const due = dueAtPickupCents(finance);
  return [
    `Olá${first ? `, ${first}` : ""}!`,
    delivery ? `Seu pedido nº ${number} está pronto:` : `Seu pedido nº ${number} está pronto e disponível para retirada:`,
    ...order.items.map((item) => `• ${item.quantity} × ${item.productName}`),
    "",
    ...(due ? [`Valor a pagar ${delivery ? "na entrega" : "na retirada"}: ${brl(due)}.`] : []),
    ...(delivery
      ? ["Assim que sair para a entrega, enviamos o link de rastreio por aqui."]
      : [`Para retirar, é só informar o número do pedido (${number}) no balcão.`, `📍 ${LOJA_ENDERECO}`, `🕘 ${LOJA_HORARIO}`]),
  ].join("\n");
}

function ensureNotices(db: DatabaseSync) {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fare_order_pickup_notices'").get()) return;
  runOrderMigrations(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fare_order_pickup_notices'").get()) {
      db.exec("CREATE TABLE fare_order_pickup_notices (order_id TEXT PRIMARY KEY, state TEXT NOT NULL, detail TEXT, at TEXT NOT NULL)");
      // Pedidos que já estavam prontos antes de o aviso existir não recebem mensagem atrasada.
      db.prepare(`INSERT INTO fare_order_pickup_notices (order_id, state, detail, at)
        SELECT id, 'pulado', 'Pronto antes do aviso automático existir.', ? FROM fare_orders WHERE status = 'aguardando_retirada'`)
        .run(new Date().toISOString());
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getPickupNotice(db: DatabaseSync, orderId: string): PickupNotice | null {
  ensureNotices(db);
  const row = db.prepare("SELECT state, detail, at FROM fare_order_pickup_notices WHERE order_id = ?").get(orderId) as PickupNotice | undefined;
  return row ? { state: row.state, detail: row.detail, at: row.at } : null;
}

/** Pedidos em Finalizado há 5 min ou mais que ainda não tiveram aviso. */
export function duePickupNotices(db: DatabaseSync, now = new Date()): string[] {
  ensureNotices(db);
  const rows = db.prepare(`SELECT o.id FROM fare_orders o
    WHERE o.status = 'aguardando_retirada'
      AND NOT EXISTS (SELECT 1 FROM fare_order_pickup_notices n WHERE n.order_id = o.id)
      AND (SELECT MAX(h.created_at) FROM fare_order_status_history h WHERE h.order_id = o.id AND h.next_status = 'aguardando_retirada') <= ?`)
    .all(new Date(now.getTime() - AVISO_APOS_MS).toISOString()) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

/** Manda o aviso de um pedido (só uma vez: grava antes de enviar). Devolve null se não era para mandar. */
export async function sendPickupNotice(db: DatabaseSync, orderId: string, fetcher: typeof fetch = fetch): Promise<PickupNotice | null> {
  ensureNotices(db);
  const order = findOrderById(db, orderId);
  if (!order || order.status !== "aguardando_retirada") return null;
  const claimed = db.prepare("INSERT OR IGNORE INTO fare_order_pickup_notices (order_id, state, detail, at) VALUES (?, 'enviando', NULL, ?)")
    .run(orderId, new Date().toISOString());
  if (Number(claimed.changes) !== 1) return null;
  const finish = (state: PickupNotice["state"], detail: string | null): PickupNotice => {
    const at = new Date().toISOString();
    db.prepare("UPDATE fare_order_pickup_notices SET state = ?, detail = ?, at = ? WHERE order_id = ?").run(state, detail, at, orderId);
    return { state, detail, at };
  };
  try {
    if (!order.customer.phone?.trim()) return finish("falhou", "Pedido sem telefone do cliente.");
    runAtendimentoMigrations(db);
    const phone = normalizeOutboundPhone(order.customer.phone);
    const conversation = findConversationByPhone(db, "whatsapp", phone) ?? (await whatsAppConversationFor(db, phone, fetcher));
    if (!conversation.contactName && order.customer.name.trim()) updateConversationProfile(db, conversation.id, { contactName: order.customer.name.trim().slice(0, 80) });
    const message = addMessage(db, { conversationId: conversation.id, author: "ia", authorName: REAL_AI_NAME, body: pickupNoticeText(order, getOrderFinance(db, order.id)) });
    await deliverToWhatsApp(db, [message], bridgeConfig(), fetcher);
    const sent = getMessage(db, message.id);
    return sent?.delivery === "enviada" ? finish("enviado", null) : finish("falhou", sent?.deliveryError || "Falha no envio.");
  } catch (error) {
    return finish("falhou", error instanceof Error ? error.message : "Falha no envio.");
  }
}

const timer = globalThis as typeof globalThis & { farePickupNotices?: ReturnType<typeof setInterval> };

/** Confere a cada 30 s os pedidos que já podem ser avisados (uma rodada por servidor). */
export function startPickupNotices(db: DatabaseSync) {
  if (timer.farePickupNotices) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const id of duePickupNotices(db)) await sendPickupNotice(db, id);
    } catch (error) {
      console.error("[aviso de retirada]", error);
    } finally {
      running = false;
    }
  };
  timer.farePickupNotices = setInterval(() => void tick(), 30_000);
  timer.farePickupNotices.unref?.();
}
