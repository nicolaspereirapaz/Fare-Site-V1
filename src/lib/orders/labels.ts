import type { PaymentMethod } from "@/lib/orders/repository";
import type { StatusPedido } from "@/lib/backoffice/orderStatus";

/**
 * Rótulos que o CLIENTE vê. O pagamento não acontece no site: o 1º status é o pedido recebido,
 * à espera da confirmação da equipe (o painel interno mostra "Aguardando pagamento").
 */
export const ORDER_STATUS_LABELS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Pedido enviado",
  aguardando_arte: "Pagamento confirmado",
  criando_arte: "Criando a arte",
  aguardando_producao: "Aguardando produção",
  em_producao: "Em produção",
  aguardando_retirada: "Pronto para retirada",
  aguardando_feedback: "Entregue",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
  faturamento_empresa: "Faturamento para empresa",
};
