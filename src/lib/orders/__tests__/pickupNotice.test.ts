import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDirectOrder, getOrderFinance, type DirectOrderInput, type OrderFinance } from "@/lib/orders/payments";
import { duePickupNotices, getPickupNotice, pickupNoticeText, sendPickupNotice } from "@/lib/orders/pickupNotice";
import { findOrderById, listOrderStatusHistory, runOrderMigrations, updateOrderStatus } from "@/lib/orders/repository";

const input: DirectOrderInput = {
  userId: "customer-1", idempotencyKey: "direct-1",
  customer: { name: "Ana Souza", phone: "(11) 99999-9999" },
  items: [{ id: "item-1", productName: "Foto 10x15", slug: "foto", quantity: 2, selections: {}, artworkName: null, unitPrice: 10 }],
  discount: { type: "percent", value: 10 }, paymentMethod: "pix",
  actorId: "staff-1", actorName: "Maria", internalNotes: "",
  deliveryDate: "2026-10-30", deliveryMode: "retirada", installments: null, dueDate: null,
  payment: { amountCents: 500, paidAt: "2026-10-14" },
};

let db: DatabaseSync;
beforeEach(() => { db = new DatabaseSync(":memory:"); });
afterEach(() => { db.close(); vi.unstubAllEnvs(); });

/** Pedido direto levado até Finalizado; `minutesAgo` = há quanto tempo entrou lá. */
function readyOrder(minutesAgo: number, patch: Partial<DirectOrderInput> = {}) {
  const order = createDirectOrder(db, { ...input, ...patch });
  for (const next of ["criando_arte", "aguardando_producao", "em_producao", "aguardando_retirada"] as const) {
    updateOrderStatus(db, { orderId: order.id, nextStatus: next, actorId: "staff-1" });
  }
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  db.prepare("UPDATE fare_order_status_history SET created_at = ? WHERE order_id = ? AND next_status = 'aguardando_retirada'").run(at, order.id);
  return order;
}

function bridge() {
  vi.stubEnv("FARE_PONTE_URL", "http://ponte.test");
  vi.stubEnv("FARE_PONTE_TOKEN", "segredo");
  return vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (url) => String(url).endsWith("/numero")
    ? Response.json({ chatId: "5511999999999@s.whatsapp.net", phone: "5511999999999" })
    : Response.json({ messageId: "wa-1" }));
}

describe("aviso de pedido pronto no WhatsApp", () => {
  it("retirada: número, itens, valor que falta, como retirar, endereço e horário", () => {
    runOrderMigrations(db);
    const order = createDirectOrder(db, input);
    expect(pickupNoticeText(order, getOrderFinance(db, order.id))).toBe([
      "Olá, Ana!",
      "Seu pedido nº 0001 está pronto e disponível para retirada:",
      "• 2 × Foto 10x15",
      "",
      "Valor a pagar na retirada: R$ 13,00.",
      "Para retirar, é só informar o número do pedido (0001) no balcão.",
      "📍 Rua do Rosário, 68, Centro, Jundiaí/SP",
      "🕘 Seg a sex 9h às 18h, sáb 9h às 13h",
    ].join("\n"));
  });

  it("entrega quitada: avisa que o rastreio vem quando sair, sem endereço da loja nem valor", () => {
    runOrderMigrations(db);
    const order = createDirectOrder(db, input);
    const finance = { ...getOrderFinance(db, order.id)!, deliveryMode: "entrega", balanceCents: 0 } as OrderFinance;
    const text = pickupNoticeText(order, finance);
    expect(text).toContain("Seu pedido nº 0001 está pronto:\n• 2 × Foto 10x15");
    expect(text).toContain("Assim que sair para a entrega, enviamos o link de rastreio por aqui.");
    expect(text).not.toMatch(/Rua do Rosário|Valor a pagar/);
  });

  it("saldo com vencimento combinado (boleto) não aparece como valor a pagar", () => {
    runOrderMigrations(db);
    const order = createDirectOrder(db, input);
    const finance = { ...getOrderFinance(db, order.id)!, dueDate: "2026-12-10" };
    expect(pickupNoticeText(order, finance)).not.toContain("Valor a pagar");
  });

  it("só fica pronto para avisar 5 min depois de entrar em Finalizado", () => {
    runOrderMigrations(db);
    getPickupNotice(db, "nenhum"); // cria a tabela antes dos pedidos
    const recent = readyOrder(4);
    const old = readyOrder(5.1, { idempotencyKey: "direct-2" });
    expect(duePickupNotices(db)).toEqual([old.id]);
    expect(recent.id).not.toBe(old.id);
  });

  it("pedidos que já estavam prontos quando o aviso passou a existir não recebem mensagem atrasada", () => {
    const order = readyOrder(60);
    expect(duePickupNotices(db)).toEqual([]);
    expect(getPickupNotice(db, order.id)).toMatchObject({ state: "pulado" });
  });

  it("manda uma vez só, pela conversa do WhatsApp, como mensagem da IA", async () => {
    getPickupNotice(db, "nenhum");
    const order = readyOrder(6);
    const fetcher = bridge();
    expect(await sendPickupNotice(db, order.id, fetcher)).toMatchObject({ state: "enviado", detail: null });
    expect(await sendPickupNotice(db, order.id, fetcher)).toBeNull();
    expect(duePickupNotices(db)).toEqual([]);
    const sent = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/enviar"));
    expect(sent).toHaveLength(1);
    expect(JSON.parse(String(sent[0][1]?.body))).toMatchObject({ chatId: "5511999999999@s.whatsapp.net", text: expect.stringContaining("Seu pedido nº 0001 está pronto") });
    const message = db.prepare("SELECT author, author_name, delivery FROM atd_messages").get();
    expect(message).toMatchObject({ author: "ia", author_name: "IA", delivery: "enviada" });
    expect(db.prepare("SELECT contact_name FROM atd_conversations").get()).toMatchObject({ contact_name: "Ana Souza" });
  });

  it("sem telefone: registra a falha (a equipe vê no quadro) e não tenta de novo", async () => {
    getPickupNotice(db, "nenhum");
    const order = readyOrder(6, { customer: { name: "Ana" } });
    const fetcher = bridge();
    expect(await sendPickupNotice(db, order.id, fetcher)).toMatchObject({ state: "falhou", detail: "Pedido sem telefone do cliente." });
    expect(fetcher).not.toHaveBeenCalled();
    expect(duePickupNotices(db)).toEqual([]);
  });

  it("voltou para produção antes do aviso: não manda", async () => {
    getPickupNotice(db, "nenhum");
    const order = readyOrder(6);
    updateOrderStatus(db, { orderId: order.id, nextStatus: "em_producao", actorId: "staff-1" });
    const fetcher = bridge();
    expect(duePickupNotices(db)).toEqual([]);
    expect(await sendPickupNotice(db, order.id, fetcher)).toBeNull();
    expect(getPickupNotice(db, order.id)).toBeNull();
  });
});

describe("Aguardando feedback saiu do quadro", () => {
  it("pedidos que estavam lá viram Entregue, com registro no histórico", () => {
    runOrderMigrations(db);
    const order = createDirectOrder(db, input);
    db.prepare("UPDATE fare_orders SET status = 'aguardando_feedback' WHERE id = ?").run(order.id);
    runOrderMigrations(db);
    expect(findOrderById(db, order.id)?.status).toBe("concluido");
    expect(listOrderStatusHistory(db, order.id).at(-1)).toMatchObject({ previousStatus: "aguardando_feedback", nextStatus: "concluido", actorId: "sistema" });
  });
});
