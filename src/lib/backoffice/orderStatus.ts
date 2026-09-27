export const ORDEM_STATUS_PEDIDO = [
  "aguardando_personalizacao",
  "personalizacao_definida",
  "aguardando_pagamento",
  "pagamento_confirmado",
  "em_producao",
  "pronto_para_envio",
  "enviado",
  "concluido",
  "cancelado",
] as const;

export type StatusPedido = (typeof ORDEM_STATUS_PEDIDO)[number];

const TRANSICOES_PERMITIDAS: Record<StatusPedido, StatusPedido[]> = {
  aguardando_personalizacao: ["personalizacao_definida", "cancelado"],
  personalizacao_definida: ["aguardando_pagamento", "cancelado"],
  aguardando_pagamento: ["pagamento_confirmado", "cancelado"],
  pagamento_confirmado: ["em_producao", "cancelado"],
  em_producao: ["pronto_para_envio", "cancelado"],
  pronto_para_envio: ["enviado"],
  enviado: ["concluido"],
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
