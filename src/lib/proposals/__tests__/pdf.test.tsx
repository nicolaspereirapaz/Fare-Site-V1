// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderProposalPdf } from "@/lib/proposals/pdf";
import type { Proposal } from "@/lib/proposals/proposal";
import { FARE_COMPANY } from "@/lib/proposals/proposal";

const PROPOSAL: Proposal = {
  code: "ORC-B84713", issuedAt: "13/10/2026", validUntil: "20/10/2026",
  customer: { name: "Ana Souza", company: "Padaria Boa Vista Ltda", document: "CNPJ 11.222.333/0001-81", phone: "(11) 98888-7777", city: "Jundiaí · SP" },
  seller: "Bia",
  items: [
    { name: "Caneta Plástica Touch", url: "https://www.farefoto.com.br/brindes/7c669c153f261709", code: "X10107", color: "Azul", imageUrl: null, engravings: ["Laser · Corpo"], quantity: 300, unitPrice: 5.77, total: 1731 },
    { name: "Banner lona", url: null, code: null, color: null, imageUrl: null, engravings: [], quantity: 2, unitPrice: 126, total: 252 },
  ],
  subtotal: 1983,
  discount: null,
  total: 1983,
  terms: [{ title: "Prazo de produção", text: "7 dias." }],
  notice: "Início da produção mediante sinal de 50%.",
  company: FARE_COMPANY,
};

describe("PDF da proposta", () => {
  it("gera um PDF com o link do produto", async () => {
    const pdf = await renderProposalPdf(PROPOSAL);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    // Anotação de link (URI) para a página do produto e para o WhatsApp da Fare Foto.
    const raw = pdf.toString("latin1");
    expect(raw).toContain("https://www.farefoto.com.br/brindes/7c669c153f261709");
    expect(raw).toContain("https://wa.me/5511953147703");
  }, 30_000);

  it("sem cliente, gera normalmente", async () => {
    const pdf = await renderProposalPdf({ ...PROPOSAL, customer: { name: "", company: null, document: null, phone: "", city: null } });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("com desconto, gera normalmente", async () => {
    const pdf = await renderProposalPdf({ ...PROPOSAL, discount: { label: "Desconto (10%)", amount: 198.3 }, total: 1784.7 });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});
