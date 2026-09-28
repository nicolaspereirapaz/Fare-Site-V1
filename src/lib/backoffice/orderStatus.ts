export const ORDEM_STATUS_PEDIDO = [
  "aguardando_pagamento",
  "pagamento_confirmado",
  "aguardando_personalizacao",
  "personalizacao_em_aprovacao",
  "personalizacao_aprovada",
  "em_producao",
  "pronto_para_envio",
  "em_transporte_ou_retirada",
  "concluido",
  "cancelado",
] as const;

export type StatusPedido = (typeof ORDEM_STATUS_PEDIDO)[number];

const TRANSICOES_PERMITIDAS: Record<StatusPedido, StatusPedido[]> = {
  aguardando_pagamento: ["pagamento_confirmado", "cancelado"],
  pagamento_confirmado: ["aguardando_personalizacao", "cancelado"],
  aguardando_personalizacao: ["personalizacao_em_aprovacao", "cancelado"],
  personalizacao_em_aprovacao: ["personalizacao_aprovada", "cancelado"],
  personalizacao_aprovada: ["em_producao", "cancelado"],
  em_producao: ["pronto_para_envio", "cancelado"],
  pronto_para_envio: ["em_transporte_ou_retirada", "cancelado"],
  em_transporte_ou_retirada: ["concluido", "cancelado"],
  concluido: [],
  cancelado: [],
};

export function podeTransicionarStatusPedido(
  de: StatusPedido,
  para: StatusPedido,
): boolean {
  return TRANSICOES_PERMITIDAS[de].includes(para);
}

export class TransicaoStatusPedidoInvalidaError extends Error {
  constructor(de: StatusPedido, para: StatusPedido) {
    super(`Transição de status inválida: "${de}" -> "${para}".`);
    this.name = "TransicaoStatusPedidoInvalidaError";
  }
}

export function transicionarStatusPedido(
  de: StatusPedido,
  para: StatusPedido,
): StatusPedido {
  if (!podeTransicionarStatusPedido(de, para)) {
    throw new TransicaoStatusPedidoInvalidaError(de, para);
  }

  return para;
}
