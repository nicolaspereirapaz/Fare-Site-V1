export type QuoteCartItem = {
  id: string;
  productName: string;
  slug: string;
  quantity: number;
  quantityRange?: string;
  selections: Record<string, string>;
  artworkName?: string | null;
  unitPrice: number | null;
  /**
   * Brindes: parâmetros públicos para recalcular o valor por unidade quando a quantidade muda
   * (venda por unidade já com margem + frete do fornecedor a ratear, em centavos). Nunca o custo.
   */
  pricing?: { unitSaleCents: number; freightCents: number } | null;
  /** Gravado pelo servidor no pedido: código Fare Foto, código real do fornecedor e SKU (painel da equipe). */
  codes?: { fare: string; supplier: "xbz" | "spot" | "asia"; supplierCode: string; sku: string } | null;
  /** Gravações do item (o que o cliente vê na proposta): técnica e local, sem custo. */
  gravacoes?: Array<{ descricao: string; local: string }>;
  /** Composição do preço feita pela equipe no painel (custo, personalização). Nunca vai para o cliente. */
  costing?: ItemCosting | null;
};

export type ItemCosting = {
  custoProduto: number;
  personalizacao: string | null;
  detalhe: string;
  personalizacaoUnitaria: number;
  custoPersonalizacaoTotal: number;
  freteFornecedor: number;
  tecnica: Record<string, unknown> & { tipo: string };
  /** Todas as gravações do item (painel): técnica como foi escolhida, local e custo calculado. */
  gravacoes?: Array<{ tecnica: Record<string, unknown> & { tipo: string }; local: string; descricao: string; detalhe: string; custoUnitario: number; custoTotal: number }>;
  por: string;
  em: string;
};

export type QuoteCustomer = {
  name: string;
  company?: string;
  phone?: string;
  notes?: string;
  /** Dados da nota: copiados do cadastro da conta pelo servidor no momento do pedido. */
  billing?: QuoteBilling;
};

export type QuoteBilling = {
  personType: "pf" | "pj";
  document: string;
  companyName: string;
  tradeName: string;
  stateRegistration: string;
  address: {
    cep: string;
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
  };
};

/** "Rua X, 100, Sala 2 — Centro, Jundiaí/SP — CEP 13201-000" */
export function formatBillingAddress(address: QuoteBilling["address"]) {
  const street = [address.street, address.number, address.complement].filter(Boolean).join(", ");
  return `${street} — ${address.district}, ${address.city}/${address.state} — CEP ${address.cep}`;
}

function billingLines(billing: QuoteBilling | undefined) {
  if (!billing) return [];
  const pj = billing.personType === "pj";
  return [
    "Faturar para:",
    ...(pj
      ? [
          `Razão social: ${billing.companyName}`,
          `CNPJ: ${billing.document}`,
          `IE: ${billing.stateRegistration}`,
        ]
      : [`CPF: ${billing.document}`]),
    `Endereço: ${formatBillingAddress(billing.address)}`,
    "",
  ];
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export function calculateLineTotal(
  basePrice: number | null,
  modifiers: number[],
  quantity: number,
) {
  if (basePrice === null) return null;

  const unitPrice = modifiers.reduce((total, modifier) => total + modifier, basePrice);
  return Math.round(unitPrice * Math.max(quantity, 1) * 100) / 100;
}

export function buildQuoteMessage(customer: QuoteCustomer, items: QuoteCartItem[]) {
  const customerLines = [
    "Pedido de orçamento — Fare Foto",
    "",
    `Cliente: ${customer.name}`,
    customer.company ? `Empresa: ${customer.company}` : null,
    customer.phone ? `Telefone: ${customer.phone}` : null,
    "",
    ...billingLines(customer.billing),
  ].filter((line): line is string => line !== null);

  const itemLines = items.flatMap((item, index) => {
    const selectionLines = Object.entries(item.selections).map(
      ([label, value]) => `  • ${label}: ${value}`,
    );
    const total =
      item.unitPrice === null
        ? "sob consulta"
        : formatCurrency(item.unitPrice * item.quantity);

    return [
      `${index + 1}. ${item.productName}`,
      ...(item.codes?.fare ? [`  • Código: ${item.codes.fare}`] : []),
      `  • Quantidade: ${item.quantityRange ?? item.quantity}`,
      ...selectionLines,
      item.artworkName ? `  • Arte: ${item.artworkName}` : "  • Arte: enviarei no WhatsApp",
      `  • Valor: ${total}`,
      "",
    ];
  });

  const notes = customer.notes ? ["Observações:", customer.notes, ""] : [];

  return [
    ...customerLines,
    ...itemLines,
    ...notes,
    "Olá! Gostaria de confirmar disponibilidade, prazo e valor deste pedido.",
  ].join("\n");
}

export function buildWhatsAppUrl(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
