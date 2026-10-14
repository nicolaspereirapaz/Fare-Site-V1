# Pedido direto da equipe — contrato aprovado

## Escopo
- Reutilizar `QuoteEditor` com `mode="order"` em `/equipe/pedidos/novo` e o CSS/fonte atual (DM Sans/Outfit).
- Cliente obrigatório, mesmos produtos/múltipla seleção/configuração, preço recalculado no servidor e desconto.
- Dinheiro e débito somente para a equipe. Checkout público mantém métodos atuais.
- Valor pago livre; saldo em centavos = total descontado - soma de recebimentos efetivos. Sem pagamento -> aguardando_pagamento; qualquer recebimento -> aguardando_arte. Sem orçamento intermediário.
- Parcelas 1..12 apenas crédito; vencimento apenas boleto/faturamento. Data prevista de entrega e retirada/entrega.
- Tabelas internas de metadados/recebimentos: actorId, actorName, data, método, valor; transação e idempotência na criação/recebimento. Nunca inferir recebimentos de datas/status ou boletos emitidos.
- Saldo e entrega no cartão e detalhe da equipe; não mostrar ledger/explicação financeira no formulário de criação.

## Backend (agente isolado: únicos arquivos de escrita)
- `src/lib/orders/repository.ts` (método dinheiro e migração segura preservando desconto/histórico)
- `src/lib/orders/payments.ts` NOVO
- testes novos/ajustes apenas em `src/lib/orders/__tests__/`

Exports de payments.ts:
- `type DirectOrderInput = CreateOrderInput & { actorId:string; actorName:string; internalNotes:string; deliveryDate:string|null; deliveryMode:'retirada'|'entrega'; installments:number|null; dueDate:string|null; payment:{amountCents:number;paidAt:string|null} }`
- `createDirectOrder(db:DatabaseSync,input:DirectOrderInput):Order`
- `getOrderFinance(db:DatabaseSync,orderId:string): OrderFinance|null`
- `type OrderFinance = { paidCents:number;balanceCents:number;createdBy:string;internalNotes:string;deliveryDate:string|null;deliveryMode:'retirada'|'entrega';installments:number|null;dueDate:string|null;payments:OrderPayment[] }`
- `type OrderPayment = { id:string;amountCents:number;paymentMethod:PaymentMethod;paidAt:string;actorId:string;actorName:string }`
- `recordOrderPayment(db:DatabaseSync,input:{orderId:string;idempotencyKey:string;amountCents:number;paymentMethod:PaymentMethod;paidAt:string;actorId:string;actorName:string}):OrderFinance`
- `export const STAFF_PAYMENT_METHODS: readonly PaymentMethod[]` todos 6 (pix, dinheiro, cartao_debito, cartao_credito, boleto, faturamento_empresa).

Validar tipos/valores/datas no backend (centavos inteiros seguros, datas YYYY-MM-DD válidas, saldo não negativo, pagamento 0 não cria ledger, cliente real obrigatoriedade handler). `paidAt` para recebimento positivo é YYYY-MM-DD. Repetição com mesma chave não duplica nem altera. Todos writes da criação e recebimento atômicos. Recebimento em pedido cancelado/concluído bloquear; legado sem metadados não atribuir saldo automaticamente. Registrar primeiro recebimento em aguardando_pagamento muda para aguardando_arte com histórico, sem alterar as demais etapas. History inicial actorId; UI usa ele como origem da arte.

## Parent (outros arquivos exclusivamente)
- handler `quoteBuilderHandlers.createOrder` reutiliza deps e customerSnapshot/buildQuoteItems, POST `/api/backoffice/pedido-editor` em rota nova.
- resumo opcional `finance` em `/api/backoffice/orders` e detail; `createListBackofficeOrdersHandler` callback opcional `readFinance`.
- POST `/api/backoffice/orders/[code]/pagamentos` protegido da equipe, usa recordOrderPayment.
- UI PaymentFields em editor, Kanban dívida/prazo, botão Novo pedido, registrar recebimento detalhe, rótulo Dinheiro interno/público (sem disponibilizar no checkout).

Nenhum agente roda servidor/build/suíte completa; parent verifica integração, faz backup SQLite antes de migrar, QA real, commit sem push. Só GPT; não chamar Claude.
