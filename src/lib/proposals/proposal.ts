import type { QuoteCartItem } from "@/lib/commerce";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { quoteCode } from "@/lib/quotes/quoteCode";
import type { Quote } from "@/lib/quotes/repository";

/**
 * Proposta comercial que vai para o cliente (PDF + WhatsApp). Só dados públicos:
 * nunca custo, fornecedor, código do fornecedor, SKU ou observação interna.
 */

export const PROPOSAL_VALIDITY_DAYS = 7;
export const PROPOSAL_TERMS = {
  production: "7 dias após a aprovação da arte.",
  payment: "Pix, boleto faturado (sob análise de CNPJ) ou cartão de crédito (via simulação).",
  /** Destaque separado no PDF, junto do total. */
  deposit: "Início da produção mediante sinal de 50%.",
  freight: "A combinar.",
};
export const FARE_COMPANY = {
  name: "Fare Foto",
  document: "CNPJ 50.344.377/0001-36",
  address: "Rua do Rosário, 68 - Centro · Jundiaí/SP",
  whatsapp: "(11) 95314-7703",
  site: "farefoto.com.br",
};

export type ProposalItem = {
  name: string;
  /** Página do produto no site (item fora do catálogo não tem). */
  url: string | null;
  code: string | null;
  color: string | null;
  imageUrl: string | null;
  engravings: string[];
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Proposal = {
  code: string;
  issuedAt: string;
  validUntil: string;
  customer: { name: string; company: string | null; document: string | null; phone: string; city: string | null };
  seller: string;
  items: ProposalItem[];
  total: number;
  terms: Array<{ title: string; text: string }>;
  notice: string;
  company: typeof FARE_COMPANY;
};

const OPEN = ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"];
const GIFT_PREFIX = "brindes/";
const cents = (value: number) => Math.round(value * 100) / 100;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(date);
}

export function buildProposal(
  quote: Quote,
  options: { seller: string; now?: Date; siteUrl: string; imageOf?: (item: QuoteCartItem) => string | null },
): Proposal {
  if (!OPEN.includes(quote.status)) throw new Error("Este orçamento já foi fechado.");
  if (!quote.items.length) throw new Error("O orçamento não tem itens.");
  const missing = quote.items.find((item) => item.unitPrice === null || !(item.unitPrice > 0));
  if (missing) throw new Error(`"${missing.productName}" está sem preço. Abra o orçamento e salve os itens.`);

  const now = options.now ?? new Date();
  const site = options.siteUrl.replace(/\/+$/, "");
  const items = quote.items.map((item): ProposalItem => {
    const unitPrice = item.unitPrice as number;
    const gift = item.slug.startsWith(GIFT_PREFIX);
    return {
      name: item.productName,
      url: gift ? `${site}/${item.slug}` : null,
      code: item.codes?.fare || null,
      color: item.selections?.["Variação"] || null,
      imageUrl: options.imageOf?.(item) ?? null,
      engravings: (item.gravacoes ?? []).map((g) => (g.local ? `${g.descricao} · ${g.local}` : g.descricao)),
      quantity: item.quantity,
      unitPrice,
      total: cents(unitPrice * item.quantity),
    };
  });

  const billing = quote.customer.billing;
  const company = billing?.personType === "pj" ? billing.companyName || billing.tradeName : quote.customer.company;
  return {
    code: quoteCode(quote.id),
    issuedAt: formatDate(now),
    validUntil: formatDate(new Date(now.getTime() + PROPOSAL_VALIDITY_DAYS * 86_400_000)),
    customer: {
      name: quote.customer.name,
      company: company || null,
      document: billing ? `${billing.personType === "pj" ? "CNPJ" : "CPF"} ${billing.document}` : null,
      phone: quote.customer.phone ?? "",
      city: billing?.address.city ? `${billing.address.city} · ${billing.address.state}` : null,
    },
    seller: options.seller,
    items,
    total: cents(items.reduce((sum, item) => sum + item.total, 0)),
    terms: [
      { title: "Prazo de produção", text: PROPOSAL_TERMS.production },
      { title: "Pagamento", text: PROPOSAL_TERMS.payment },
      { title: "Frete", text: PROPOSAL_TERMS.freight },
      { title: "Validade", text: `Até ${formatDate(new Date(now.getTime() + PROPOSAL_VALIDITY_DAYS * 86_400_000))}, sujeita ao estoque do fornecedor.` },
    ],
    notice: PROPOSAL_TERMS.deposit,
    company: FARE_COMPANY,
  };
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (value: number) => money.format(value).replace(/\u00a0/g, " ");

export function proposalWhatsAppText(proposal: Proposal): string {
  const first = proposal.customer.name.trim().split(/\s+/)[0] ?? "";
  const lines = proposal.items.map((item) => {
    const parts = [`• ${item.quantity.toLocaleString("pt-BR")} × ${item.name}${item.color ? ` (${item.color})` : ""}`];
    if (item.engravings.length) parts.push(item.engravings.join(" + "));
    parts.push(`${brl(item.unitPrice)}/un.`);
    return parts.join(" — ");
  });
  return [
    `Olá, ${first}! Aqui é a ${proposal.seller}, da Fare Foto.`,
    "",
    `Segue a proposta do seu orçamento ${proposal.code}:`,
    "",
    ...lines,
    "",
    `*Total: ${brl(proposal.total)}* (frete a combinar)`,
    `Produção: ${PROPOSAL_TERMS.production} Início mediante sinal de 50%.`,
    `Válida até ${proposal.validUntil}.`,
    "",
    "O PDF com os detalhes vai em seguida. Para aprovar, é só responder por aqui!",
  ].join("\n");
}

export function proposalWhatsAppUrl(proposal: Proposal): string | null {
  const digits = proposal.customer.phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return buildWhatsAppUrl(full, proposalWhatsAppText(proposal));
}

/** Botões do PDF: o cliente responde para o WhatsApp da Fare Foto com a mensagem já escrita. */
export function proposalReplyLinks(proposal: Proposal): { approve: string; talk: string } {
  const store = `55${proposal.company.whatsapp.replace(/\D/g, "")}`;
  const hello = `Olá, ${proposal.seller}!`;
  return {
    approve: buildWhatsAppUrl(store, `${hello} Aprovo a proposta ${proposal.code} (total ${brl(proposal.total)}). Como seguimos?`),
    talk: buildWhatsAppUrl(store, `${hello} Quero falar sobre a proposta ${proposal.code}.`),
  };
}
