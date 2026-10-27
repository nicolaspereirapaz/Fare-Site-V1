// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPanelCustomer, customerHistory, DuplicateCustomerError, listCustomers, resolveCustomer, updateCustomer } from "@/lib/customers/repository";
import { createManualQuote, findQuoteById } from "@/lib/quotes/repository";

const actor = { id: "s1", name: "Bia" };
const items = [{ id: "a", productName: "Caneca", slug: "brindes/x", quantity: 1, selections: {}, artworkName: null, unitPrice: 10 }];

describe("editar cliente cadastrado", () => {
  it("corrige o cadastro, atualiza orçamento aberto, recusa WhatsApp de outro e mostra o histórico", () => {
    const db = new DatabaseSync(":memory:");
    const ana = createPanelCustomer(db, { name: "Ana Silva", phone: "(11) 91111-1111" }, actor);
    createPanelCustomer(db, { name: "Bruno Lima", phone: "(11) 92222-2222" }, actor);
    const quote = createManualQuote(db, { ownerId: `painel:${ana.id}`, customer: { name: "Ana Silva", phone: "(11) 91111-1111" }, items, createdBy: "Bia", internalNotes: "", idempotencyKey: "k1" });

    const saved = updateCustomer(db, ana.ref, { name: "Ana Maria Silva", company: "Loja da Ana", phone: "(11) 93333-3333" });
    expect(saved).toMatchObject({ name: "Ana Maria Silva", company: "Loja da Ana", phone: "(11) 93333-3333" });
    expect(findQuoteById(db, quote.id)!.customer).toMatchObject({ name: "Ana Maria Silva", company: "Loja da Ana", phone: "(11) 93333-3333" });
    expect(findQuoteById(db, quote.id)!.updatedAt).toBe(quote.updatedAt); // quem está com o orçamento aberto ainda salva

    expect(() => updateCustomer(db, ana.ref, { name: "Ana", phone: "(11) 92222-2222" })).toThrow(DuplicateCustomerError);
    expect(listCustomers(db).map((c) => c.name)).toEqual(["Ana Maria Silva", "Bruno Lima"]);
    expect(customerHistory(db, ana.ref)).toMatchObject([{ kind: "quote", id: quote.id }]);
  });

  it("endereço de entrega: salva no cadastro, vai para o orçamento aberto e some quando apagado", () => {
    const db = new DatabaseSync(":memory:");
    const ana = createPanelCustomer(db, { name: "Ana Silva", phone: "(11) 91111-1111", address: " Rua A, 10 — Centro " }, actor);
    expect(resolveCustomer(db, ana.ref)?.address).toBe("Rua A, 10 — Centro");
    const quote = createManualQuote(db, { ownerId: `painel:${ana.id}`, customer: { name: "Ana Silva", phone: "(11) 91111-1111" }, items, createdBy: "Bia", internalNotes: "", idempotencyKey: "k2" });
    updateCustomer(db, ana.ref, { name: "Ana Silva", phone: "(11) 91111-1111", address: "Rua B, 20" });
    expect(findQuoteById(db, quote.id)!.customer.address).toBe("Rua B, 20");
    updateCustomer(db, ana.ref, { name: "Ana Silva", phone: "(11) 91111-1111", address: "" });
    expect(resolveCustomer(db, ana.ref)?.address).toBeUndefined();
    expect(findQuoteById(db, quote.id)!.customer.address).toBeUndefined();
  });
});
