import { describe, expect, it } from "vitest";
import type { QuoteCartItem } from "@/lib/commerce";
import { buildProposal, proposalReplyLinks, proposalWhatsAppText, proposalWhatsAppUrl } from "@/lib/proposals/proposal";
import type { Quote } from "@/lib/quotes/repository";

const ITEMS: QuoteCartItem[] = [
  {
    id: "a", productName: "Caneta Plástica Touch", slug: "brindes/7c669c153f261709", quantity: 300, selections: { "Variação": "Azul / Prata" }, artworkName: null, unitPrice: 5.77,
    codes: { fare: "X10107", supplier: "xbz", supplierCode: "12638", sku: "12638-AZU" },
    gravacoes: [{ descricao: "Laser", local: "Corpo" }, { descricao: "DTF UV 6×6 cm", local: "" }],
    costing: { custoProduto: 1.06, personalizacao: "Laser", detalhe: "", personalizacaoUnitaria: 1, custoPersonalizacaoTotal: 300, freteFornecedor: 100, tecnica: { tipo: "laser" }, por: "Bia", em: "2026-10-13" },
  },
  { id: "b", productName: "Banner lona 90 × 120 cm", slug: "avulso:1a2b3c4d", quantity: 2, selections: {}, artworkName: null, unitPrice: 126, codes: null },
];

const QUOTE: Quote = {
  id: "b847131d-da5e-47d6-955f-29d3aa937260", userId: "painel:p1", idempotencyKey: "k",
  customer: {
    name: "Ana Souza", company: "Padaria Boa Vista", phone: "(11) 98888-7777",
    billing: { personType: "pj", document: "11.222.333/0001-81", companyName: "Padaria Boa Vista Ltda", tradeName: "", stateRegistration: "ISENTO", address: { cep: "13201-000", street: "Rua A", number: "1", complement: "", district: "Centro", city: "Jundiaí", state: "SP" } },
  },
  items: ITEMS, status: "aguardando_orcamento", orderId: null, totalCents: 198300, createdBy: "Bia", internalNotes: "não mostrar", proposalSentAt: null, createdAt: "2026-10-12T15:00:00.000Z", updatedAt: "2026-10-12T15:00:00.000Z",
};

const NOW = new Date("2026-10-13T14:00:00.000Z");
const SITE = "https://www.farefoto.com.br";

describe("proposta para o cliente", () => {
  it("monta itens com link, código Fare, cor e gravações; datas de 7 dias", () => {
    const proposal = buildProposal(QUOTE, { seller: "Bia", now: NOW, siteUrl: SITE });
    expect(proposal).toMatchObject({
      code: "ORC-B84713",
      issuedAt: "13/10/2026",
      validUntil: "20/10/2026",
      customer: { name: "Ana Souza", company: "Padaria Boa Vista Ltda", document: "CNPJ 11.222.333/0001-81", phone: "(11) 98888-7777", city: "Jundiaí · SP" },
      seller: "Bia",
      total: 1983,
    });
    expect(proposal.items[0]).toEqual({
      name: "Caneta Plástica Touch", url: `${SITE}/brindes/7c669c153f261709`, code: "X10107", color: "Azul / Prata", imageUrl: null,
      engravings: ["Laser · Corpo", "DTF UV 6×6 cm"], quantity: 300, unitPrice: 5.77, total: 1731,
    });
    expect(proposal.items[1]).toMatchObject({ name: "Banner lona 90 × 120 cm", url: null, code: null, color: null, engravings: [] });
    expect(proposal.terms.map((term) => term.title)).toEqual(["Prazo de produção", "Pagamento", "Frete", "Validade"]);
    expect(proposal.terms[0].text).toBe("7 dias após a aprovação da arte e o sinal de 50%.");
    expect(proposal.terms[1].text).toBe("Pix; boleto faturado sob análise de CNPJ; cartão de crédito via simulação. Início da produção mediante sinal de 50%.");
    expect(proposal.company).toEqual({ name: "Fare Foto", document: "CNPJ 50.344.377/0001-36", address: "Rua do Rosário, 68 - Centro · Jundiaí/SP", whatsapp: "(11) 95314-7703", site: "farefoto.com.br" });
  });

  it("nunca leva custo, fornecedor, SKU ou observação interna", () => {
    const text = JSON.stringify(buildProposal(QUOTE, { seller: "Bia", now: NOW, siteUrl: SITE }));
    for (const secret of ["12638", "xbz", "XBZ", "custoProduto", "1.06", "não mostrar", "painel:p1", "fornecedor\" ", "sku"]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/custo/i);
  });

  it("usa a foto da cor quando o servidor informa", () => {
    const proposal = buildProposal(QUOTE, { seller: "Bia", now: NOW, siteUrl: SITE, imageOf: (item) => (item.id === "a" ? "https://cdn.xbzbrindes.com.br/a.jpg" : null) });
    expect(proposal.items.map((item) => item.imageUrl)).toEqual(["https://cdn.xbzbrindes.com.br/a.jpg", null]);
  });

  it("cliente sem faturamento: usa nome e empresa do orçamento", () => {
    const proposal = buildProposal({ ...QUOTE, customer: { name: "João Lima", phone: "11 97777-1234" } }, { seller: "Bia", now: NOW, siteUrl: SITE });
    expect(proposal.customer).toEqual({ name: "João Lima", company: null, document: null, phone: "11 97777-1234", city: null });
  });

  it("não gera com item sem preço", () => {
    expect(() => buildProposal({ ...QUOTE, items: [{ ...ITEMS[1], unitPrice: null }] }, { seller: "Bia", now: NOW, siteUrl: SITE })).toThrow(/sem preço/i);
  });

  it("orçamento fechado não gera proposta", () => {
    expect(() => buildProposal({ ...QUOTE, status: "encerrado" }, { seller: "Bia", now: NOW, siteUrl: SITE })).toThrow(/fechado/i);
  });
});

describe("mensagem do WhatsApp", () => {
  it("resume itens, total, prazo e validade", () => {
    const text = proposalWhatsAppText(buildProposal(QUOTE, { seller: "Bia", now: NOW, siteUrl: SITE }));
    expect(text).toBe([
      "Olá, Ana! Aqui é a Bia, da Fare Foto.",
      "",
      "Segue a proposta do seu orçamento ORC-B84713:",
      "",
      "• 300 × Caneta Plástica Touch (Azul / Prata) — Laser · Corpo + DTF UV 6×6 cm — R$ 5,77/un.",
      "• 2 × Banner lona 90 × 120 cm — R$ 126,00/un.",
      "",
      "*Total: R$ 1.983,00* (frete a combinar)",
      "Produção: 7 dias após a aprovação da arte e o sinal de 50%.",
      "Válida até 20/10/2026.",
      "",
      "O PDF com os detalhes vai em seguida. Para aprovar, é só responder por aqui!",
    ].join("\n"));
  });

  it("abre a conversa com o cliente (DDI 55)", () => {
    const proposal = buildProposal(QUOTE, { seller: "Bia", now: NOW, siteUrl: SITE });
    const url = new URL(proposalWhatsAppUrl(proposal)!);
    expect(url.origin + url.pathname).toBe("https://wa.me/5511988887777");
    expect(url.searchParams.get("text")).toBe(proposalWhatsAppText(proposal));
    expect(proposalWhatsAppUrl({ ...proposal, customer: { ...proposal.customer, phone: "" } })).toBeNull();
  });
});

describe("botões do PDF (cliente responde para a Fare Foto)", () => {
  it("Aprovar e Falar com atendente abrem o WhatsApp da loja com a mensagem pronta", () => {
    const proposal = buildProposal(QUOTE, { seller: "Bia", now: NOW, siteUrl: SITE });
    const links = proposalReplyLinks(proposal);
    const approve = new URL(links.approve);
    const talk = new URL(links.talk);
    expect(approve.origin + approve.pathname).toBe("https://wa.me/5511953147703");
    expect(talk.origin + talk.pathname).toBe("https://wa.me/5511953147703");
    expect(approve.searchParams.get("text")).toBe("Olá, Bia! Aprovo a proposta ORC-B84713 (total R$ 1.983,00). Como seguimos?");
    expect(talk.searchParams.get("text")).toBe("Olá, Bia! Quero falar sobre a proposta ORC-B84713.");
  });
});
