import type { PaymentMethod } from "@/lib/orders/repository";
import type { StatusPedido } from "@/lib/backoffice/orderStatus";

export const ORDER_STATUS_LABELS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pagamento_confirmado: "Pagamento confirmado",
  aguardando_personalizacao: "Aguardando personalização",
  personalizacao_em_aprovacao: "Personalização em aprovação",
  personalizacao_aprovada: "Personalização aprovada",
  em_producao: "Em produção",
  pronto_para_envio: "Pronto para envio",
  em_transporte_ou_retirada: "Em transporte ou retirada",
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
