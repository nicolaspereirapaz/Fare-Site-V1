# Fechamento guiado de orçamento — implementação local

Atualizado em 2026-10-16. Sem publicação ou push.

## Interface aprovada

`CloseQuoteDialog` usa `QuoteClosingFields` e CSS isolado `closeQuote.css`, com DM Sans/Outfit existentes. O Kanban conserva seu layout. Total destacado, fonte base 16 px, título 29 px, total 32 px. Atalhos: 50% de sinal (arredondamento para cima no centavo), total, total na retirada e outro valor. O recebido começa vazio, com confirmação desabilitada. Recebido e saldo atualizam juntos; o operador também pode escolher explicitamente nenhum recebimento.

## Condição de retirada

`paymentOnPickup: true` é acordo de pagamento futuro, não recebimento. Obriga retirada na loja, pagamento zero, data de recebimento nula e ausência de parcelas/vencimento. A API rejeita tipo inválido e combinações incoerentes. O pedido segue para `aguardando_arte`, com saldo integral e ledger vazio. Zero sem essa condição continua `aguardando_pagamento`.

`fare_order_finance.payment_on_pickup` é acrescentada por migração idempotente, default 0. Financeiros antigos mantêm seu formato público sem flag falsa adicional. A fingerprint de fechamento inclui a flag quando verdadeira e preserva a representação anterior quando ausente/falsa. Chave e payload ficam congelados para retries; falha de atualização após sucesso não permite criar novamente.

Pedido, cartão e documento não afirmam pagamento recebido com base na entrada em arte. Sem recebimento, consulta/PDF/WhatsApp informam pagamento na retirada, forma a definir. Recebimento posterior usa o fluxo existente e ledger real; PDF/WhatsApp e consulta exibem então o método efetivamente recebido. Nenhuma mensagem é enviada automaticamente.

## Verificação

746 testes passaram; TypeScript, ESLint dos módulos alterados, build e diff-check aprovados. Navegador autenticado em clones dos bancos, com 25 verificações: metade, total, retirada sem recebimento, retry sem duplicação, PDF real, método posterior em dinheiro, zero comum aguardando pagamento, snapshots preservados e celular de 390 px com confirmação/rolagem acessíveis. Registros de pedidos, orçamentos, metadados financeiros e recebimentos originais conferidos por hash das colunas existentes e mantidos; integrity_check `ok`.

Evidências temporárias no perfil dev-profile: `cache/scratch/pickup-close-qa`. Credenciais/bancos QA são removidos após a conferência. O backup pré-migração e relatórios ficam no scratch e estão sujeitos à limpeza automática; não são backup permanente.
