/*
 * Até quando as fotos do link podem mudar (cliente pelo link ou equipe pelo "Editar fotos").
 * Orçamento: enquanto está aberto. Pedido: até entrar em produção — em "Aguardando produção" já trava.
 * Sem dependências do servidor: a página da equipe usa a mesma regra para mostrar o botão.
 */
export const PHOTO_LINK_QUOTE_EDITABLE: readonly string[] = ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"];
export const PHOTO_LINK_ORDER_EDITABLE: readonly string[] = ["aguardando_pagamento", "aguardando_arte", "criando_arte"];

export const photoLinkEditable = (kind: "quote" | "order", status: string) =>
  (kind === "quote" ? PHOTO_LINK_QUOTE_EDITABLE : PHOTO_LINK_ORDER_EDITABLE).includes(status);
