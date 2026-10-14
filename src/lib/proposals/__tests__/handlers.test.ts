import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createProposalHandlers } from "@/lib/proposals/handlers";
import { createManualQuote, findQuoteById, markProposalSent, updateQuoteStatus } from "@/lib/quotes/repository";

const customer = { name: "Ana Souza", company: "Padaria Boa Vista", phone: "(11) 98888-7777" };
const item = { id: "a", productName: "Caneta", slug: "brindes/cf93", quantity: 100, selections: { "Variação": "Azul" }, artworkName: null, unitPrice: 2.44, codes: { fare: "X10304", supplier: "xbz" as const, supplierCode: "00518", sku: "00518-AZU" } };

function setup(role = "vendedor") {
  const db = new DatabaseSync(":memory:");
  const quote = createManualQuote(db, { ownerId: "painel:p1", customer, items: [item], createdBy: "Bia", internalNotes: "", idempotencyKey: "k1" });
  const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
  const handlers = createProposalHandlers({
    getSession: vi.fn().mockResolvedValue(role ? { user: { id: "s1", name: "Bia Lima", role } } : null),
    database: () => db,
    siteUrl: "https://www.farefoto.com.br",
    imageOf: async () => null,
    render,
  });
  return { db, quote, handlers, render };
}

describe("proposta: rotas do painel", () => {
  it("só a equipe gera", async () => {
    const { quote, handlers } = setup("cliente");
    expect((await handlers.pdf(new Request("http://x"), quote.id)).status).toBe(403);
    expect((await setup("").handlers.send(new Request("http://x", { method: "POST" }), quote.id)).status).toBe(401);
  });

  it("baixa o PDF com o nome do arquivo e sem cache", async () => {
    const { quote, handlers, render } = setup();
    const response = await handlers.pdf(new Request("http://x"), quote.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(`Proposta-${"ORC-" + quote.id.replace(/-/g, "").slice(0, 6).toUpperCase()}.pdf`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(render.mock.calls[0][0]).toMatchObject({ seller: "Bia", items: [{ name: "Caneta", code: "X10304" }] });
  });

  it("enviar: devolve a mensagem do WhatsApp e passa para Em negociação, guardando a data", async () => {
    const { db, quote, handlers } = setup();
    const response = await handlers.send(new Request("http://x", { method: "POST" }), quote.id);
    expect(response.status).toBe(200);
    const body = await response.json() as { whatsappUrl: string; text: string; status: string };
    expect(body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    expect(body.text).toContain("Aqui é a Bia, da Fare Foto");
    expect(body.status).toBe("em_negociacao");
    expect(findQuoteById(db, quote.id)).toMatchObject({ status: "em_negociacao", proposalSentAt: expect.any(String) });
  });

  it("orçamento com item sem preço não gera (mensagem clara)", async () => {
    const db = new DatabaseSync(":memory:");
    const quote = createManualQuote(db, { ownerId: "u1", customer, items: [{ ...item, unitPrice: null }], createdBy: "Bia", internalNotes: "", idempotencyKey: "k2" });
    const handlers = createProposalHandlers({ getSession: vi.fn().mockResolvedValue({ user: { id: "s1", name: "Bia", role: "admin" } }), database: () => db, siteUrl: "https://x", imageOf: async () => null, render: vi.fn() });
    const response = await handlers.pdf(new Request("http://x"), quote.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/sem preço/) });
  });

  it("404 para orçamento que não existe", async () => {
    const { handlers } = setup();
    expect((await handlers.pdf(new Request("http://x"), "nao-existe")).status).toBe(404);
  });
});

describe("marcar proposta enviada", () => {
  it("não marca se o orçamento mudou depois de lido (ex.: encerrado enquanto as fotos carregavam)", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createManualQuote(db, { ownerId: "u1", customer, items: [item], createdBy: "Bia", internalNotes: "", idempotencyKey: "k" });
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "aguardando_pagamento" });
    expect(() => markProposalSent(db, quote.id, new Date(), quote.updatedAt)).toThrow(/mudou/);
    expect(findQuoteById(db, quote.id)!.proposalSentAt).toBeNull();
  });

  it("em negociação ou aguardando pagamento: só guarda a data, sem mudar a situação", () => {
    const db = new DatabaseSync(":memory:");
    // Feito pela equipe já nasce em "Em negociação".
    const quote = createManualQuote(db, { ownerId: "u1", customer, items: [item], createdBy: "Bia", internalNotes: "", idempotencyKey: "k" });
    expect(markProposalSent(db, quote.id, new Date("2026-10-13T11:00:00Z"))).toMatchObject({ status: "em_negociacao" });
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "aguardando_pagamento" });
    const sent = markProposalSent(db, quote.id, new Date("2026-10-13T12:00:00Z"));
    expect(sent).toMatchObject({ status: "aguardando_pagamento", proposalSentAt: "2026-10-13T12:00:00.000Z" });
  });
});
