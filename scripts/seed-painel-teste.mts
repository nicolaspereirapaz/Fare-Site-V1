/**
 * Cria dados de TESTE no painel (cliente "Cliente Teste" @exemplo.com) — um cartão em cada coluna.
 * Remover depois com: node scripts/seed-painel-teste.mts --remover   (apaga tudo do e-mail de teste)
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const load = (rel: string) => import(pathToFileURL(path.join(root, rel)).href);
const { createOrder, updateOrderStatus, runOrderMigrations } = await load("src/lib/orders/repository.ts");
const { createQuote, updateQuoteStatus, runQuoteMigrations } = await load("src/lib/quotes/repository.ts");

const EMAIL = "pedido.teste@exemplo.com";
const db = new DatabaseSync(path.join(root, "data", "farefoto.sqlite"));
db.exec("PRAGMA busy_timeout = 5000");
runOrderMigrations(db);
runQuoteMigrations(db);

function removeAll() {
  const user = db.prepare("SELECT id FROM user WHERE email = ?").get(EMAIL) as { id: string } | undefined;
  if (!user) return 0;
  db.prepare("DELETE FROM fare_order_status_history WHERE order_id IN (SELECT id FROM fare_orders WHERE user_id = ?)").run(user.id);
  db.prepare("DELETE FROM fare_orders WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM fare_quotes WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM fare_customer_profiles WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM session WHERE userId = ?").run(user.id);
  db.prepare("DELETE FROM account WHERE userId = ?").run(user.id);
  db.prepare("DELETE FROM user WHERE id = ?").run(user.id);
  return 1;
}

if (process.argv.includes("--remover")) {
  console.log(removeAll() ? "Dados de teste removidos." : "Nada para remover.");
  process.exit(0);
}

removeAll();
const userId = randomUUID();
const now = new Date().toISOString();
db.prepare("INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, role) VALUES (?, ?, ?, 0, NULL, ?, ?, 'cliente')")
  .run(userId, "Cliente Teste", EMAIL, now, now);

const billing = {
  personType: "pj", document: "11.222.333/0001-81", companyName: "Padaria Teste Ltda", tradeName: "Padaria Teste",
  stateRegistration: "ISENTO",
  address: { cep: "13201-000", street: "Rua Barão de Jundiaí", number: "100", complement: "", district: "Centro", city: "Jundiaí", state: "SP" },
};
const customer = (name: string, notes = "") => ({ name, phone: "(11) 95314-7703", company: "Padaria Teste", notes, billing });
const item = (productName: string, quantity: number, unitPrice: number, variation = "Azul") => ({
  id: randomUUID(), productName, slug: "brindes/teste", quantity, selections: { "Variação": variation }, artworkName: null, unitPrice,
});

const quote = (name: string, items: ReturnType<typeof item>[], steps: string[], notes = "") => {
  const q = createQuote(db, { userId, idempotencyKey: `teste-${randomUUID()}`, customer: customer(name, notes), items });
  for (const step of steps) updateQuoteStatus(db, { quoteId: q.id, nextStatus: step });
  return q;
};
const order = (name: string, items: ReturnType<typeof item>[], steps: string[], notes = "") => {
  const o = createOrder(db, { userId, idempotencyKey: `teste-${randomUUID()}`, customer: customer(name, notes), items, paymentMethod: "pix" });
  for (const step of steps) updateOrderStatus(db, { orderId: o.id, nextStatus: step, actorId: "teste" });
  return o;
};

// Aba Orçamentos
quote("TESTE · Aguardando orçamento", [item("Caneta Plástica", 300, 1.97)], [], "Precisa até dia 30");
quote("TESTE · Em negociação", [item("Caneca Cerâmica", 100, 12.5, "Branca")], ["em_negociacao"]);
quote("TESTE · Orçamento aguardando pagamento", [item("Squeeze Alumínio", 50, 18.9, "Prata")], ["em_negociacao", "aguardando_pagamento"]);
order("TESTE · Pedido do site aguardando pagamento", [item("Chaveiro Acrílico", 200, 2.4, "Transparente")], []);
// Aba Pedidos
const STEPS = ["aguardando_arte", "criando_arte", "aguardando_producao", "em_producao", "aguardando_retirada", "aguardando_feedback"];
const upTo = (status: string) => STEPS.slice(0, STEPS.indexOf(status) + 1);
order("TESTE · Aguardando arte", [item("Caneta Plástica", 100, 2.64)], upTo("aguardando_arte"), "Logo em anexo no WhatsApp");
order("TESTE · Criando arte", [item("Caneca Cerâmica", 100, 12.5, "Branca")], upTo("criando_arte"));
order("TESTE · Aguardando produção", [item("Squeeze Alumínio", 50, 18.9, "Prata")], upTo("aguardando_producao"));
order("TESTE · Em produção", [item("Ecobag Algodão", 100, 9.8, "Cru")], upTo("em_producao"));
order("TESTE · Aguardando retirada", [item("Bloco de Anotações", 250, 4.1, "Kraft")], upTo("aguardando_retirada"));
order("TESTE · Aguardando feedback", [item("Copo Térmico", 50, 24.0, "Preto")], upTo("aguardando_feedback"));

console.log("Dados de teste criados: 3 orçamentos + 7 pedidos (cliente pedido.teste@exemplo.com).");
db.close();
