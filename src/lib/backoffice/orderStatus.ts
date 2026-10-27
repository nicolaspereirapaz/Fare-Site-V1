/**
 * Situações do PEDIDO.
 * - aguardando_pagamento: pedido feito no site, esperando o pagamento (aparece na aba Orçamentos do painel,
 *   coluna "Aguardando pagamento", junto com os orçamentos fechados).
 * - aguardando_arte → criando_arte → aguardando_producao → em_producao → aguardando_retirada → aguardando_feedback
 *   → concluido ("Finalizado" no painel): as 7 colunas da aba Pedidos.
 * - concluido fica 24 h na coluna Finalizado e depois some do quadro (`finishedOrders.ts`).
 * - cancelado: o pedido sai do quadro.
 */
export const ORDEM_STATUS_PEDIDO = [
  "aguardando_pagamento",
  "aguardando_arte",
  "criando_arte",
  "aguardando_producao",
  "em_producao",
  "aguardando_retirada",
  "aguardando_feedback",
  "concluido",
  "cancelado",
] as const;

export type StatusPedido = (typeof ORDEM_STATUS_PEDIDO)[number];

/** Nomes das situações no painel interno. */
export const ORDER_STAFF_LABELS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  aguardando_arte: "Aguardando arte",
  criando_arte: "Criando arte",
  aguardando_producao: "Aguardando produção",
  em_producao: "Em produção",
  aguardando_retirada: "Aguardando retirada",
  aguardando_feedback: "Aguardando feedback",
  concluido: "Finalizado",
  cancelado: "Cancelado",
};

/** Colunas da aba Pedidos (o que está fora daqui não aparece no quadro de pedidos). */
export const COLUNAS_QUADRO_PEDIDOS = [
  "aguardando_arte",
  "criando_arte",
  "aguardando_producao",
  "em_producao",
  "aguardando_retirada",
  "aguardando_feedback",
  "concluido",
] as const satisfies readonly StatusPedido[];

/** Situações antigas (antes de 2026-10-09) → nova situação equivalente. */
export const STATUS_PEDIDO_LEGADO: Record<string, StatusPedido> = {
  pagamento_confirmado: "aguardando_arte",
  aguardando_personalizacao: "aguardando_arte",
  personalizacao_em_aprovacao: "criando_arte",
  personalizacao_aprovada: "aguardando_producao",
  pronto_para_envio: "aguardando_retirada",
  em_transporte_ou_retirada: "aguardando_retirada",
};

const TRANSICOES_PERMITIDAS: Record<StatusPedido, StatusPedido[]> = {
  // Pedido de fotos não tem arte: pago, vai direto para a produção.
  aguardando_pagamento: ["aguardando_arte", "aguardando_producao", "cancelado"],
  aguardando_arte: ["criando_arte", "cancelado"],
  criando_arte: ["aguardando_producao", "aguardando_arte", "cancelado"],
  aguardando_producao: ["em_producao", "criando_arte", "cancelado"],
  em_producao: ["aguardando_retirada", "aguardando_producao", "cancelado"],
  aguardando_retirada: ["aguardando_feedback", "em_producao", "cancelado"],
  aguardando_feedback: ["concluido", "aguardando_retirada", "cancelado"],
  // Finalizado por engano: volta enquanto ainda está no quadro.
  concluido: ["aguardando_feedback"],
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
