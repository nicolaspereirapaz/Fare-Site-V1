# Crédito do cliente — plano de implementação

> **Para agentes:** executado direto nesta sessão (o Nicolas pediu "faça tudo e publique"). Passos em checkbox.

**Objetivo:** a equipe lança e retira crédito na página do cliente. O vendedor é avisado e usa o crédito como desconto, em linha própria, no pedido ou no orçamento. O cliente vê o saldo em Minha conta.

**Arquitetura:** o uso do crédito fica em `QuoteDiscount.credit` (em reais, como o `freight`). Os lançamentos manuais ficam numa tabela `fare_customer_credits`. Saldo = lançamentos − crédito dos pedidos não cancelados do cliente. O saldo é conferido no servidor dentro da transação que grava o pedido.

**Stack:** Next 16, React, `node:sqlite`, vitest.

**Desenho:** `docs/superpowers/specs/2026-11-16-credito-cliente-design.md`

## Regras gerais

- Nome na tela: "Crédito do cliente". Texto de falta de saldo: "Este cliente tem só R$ X de crédito." Texto de crédito acima do total: "O crédito não pode ser maior que o total."
- Lançar, retirar e usar crédito: papéis `vendedor`/`admin` (`hasBackofficeAccess`).
- Valores do crédito em reais no `discount_json`, e em centavos na tabela de lançamentos.

## Pontos de atenção na revisão

1. Dois pedidos gravados ao mesmo tempo com o mesmo crédito → o segundo é recusado (a conferência fica dentro de `BEGIN IMMEDIATE`).
2. Pedido que usou crédito é cancelado → o saldo volta.
3. Edição de pedido que já usou crédito → o crédito do próprio pedido não conta como gasto.
4. Retirada maior que o saldo → recusada; o saldo nunca fica negativo.
5. Orçamento com crédito vira pedido sem saldo suficiente → recusado com a mensagem de falta de saldo.

---

### Tarefa 1: crédito no cálculo do desconto

**Arquivos:**
- `src/lib/quotes/discount.ts`
- teste: `src/lib/quotes/__tests__/discount.test.ts`, criar se não existir

**Produz:**
- `QuoteDiscount.credit?: number` (em reais)
- `creditOf(d): number` (em reais)
- `applyDiscount` devolve `creditCents`
- `parseDiscount` aceita `credit`

- [ ] Testes:
  - `applyDiscount(50000, {type:"percent",value:10,freight:20,credit:80})` → `{discountCents:5000, freightCents:2000, creditCents:8000, totalCents:39000}`.
  - Crédito acima de `subtotal − desconto + frete` → lança o erro "O crédito não pode ser maior que o total.".
  - `parseDiscount({type:"value",value:"",credit:"80,50"})` → `{type:"value",value:0,credit:80.5}`.
  - Crédito negativo → erro.
- [ ] Implementar e rodar `npx vitest run src/lib/quotes`.

### Tarefa 2: saldo e lançamentos

**Arquivos:**
- novo `src/lib/customers/credit.ts`
- `src/lib/orders/payments.ts` (`createDirectOrder`, `replaceOrderItems`, `validateDirectInput`)
- teste: `src/lib/customers/__tests__/credit.test.ts`

**Produz:**
- `creditBalanceCents(db, ownerId, excludeOrderId?) : number`
- `creditStatement(db, ownerId): { balanceCents; entries: Array<{ kind: "lancamento" | "pedido"; amountCents; reason: string | null; orderId: string | null; actorName: string | null; createdAt }> }`
- `addCustomerCredit(db, { ownerId, amountCents, reason, actorId, actorName })`
- `assertCreditAvailable(db, ownerId, creditCents, excludeOrderId?)`

Os donos vêm de `accountQuoteOwners(db, ownerId)`, que também serve para `painel:<id>`.

- [ ] Testes:
  - Lançar R$ 100 → saldo 10000.
  - Retirar R$ 150 → erro.
  - `createDirectOrder` com `credit: 80` → saldo 2000.
  - Segundo pedido com `credit: 30` → erro "Este cliente tem só R$ 20,00 de crédito.".
  - Cancelar o primeiro → saldo 10000.
  - `replaceOrderItems` do mesmo pedido mantendo 80 → ok.
  - Pedido com total 0 → status `aguardando_arte`.
  - Motivo vazio → erro.
- [ ] Implementar e rodar `npx vitest run src/lib/customers src/lib/orders`.

### Tarefa 3: página do cliente e API

**Arquivos:**
- nova rota `src/app/api/backoffice/orcamento-editor/clientes/credito/route.ts` (POST)
- handler `addCredit` em `quoteBuilderHandlers.ts`
- `searchCustomers ?ref=` devolve `creditCents`
- `deleteCustomer` recusa cliente com saldo
- novo `src/components/staff/CustomerCreditPanel.tsx`
- `src/app/(equipe)/equipe/clientes/[ref]/page.tsx`

- [ ] Cartão "Crédito" com saldo, valor + motivo, botões Adicionar/Retirar (`router.refresh()`) e extrato com link para o pedido.

### Tarefa 4: editor de pedido/orçamento

**Arquivos:**
- `src/components/staff/QuoteEditor.tsx`
- `totalsWithDiscount` em `quoteBuilderHandlers.ts`: `credit` nos totais; margem calculada sem o crédito.

- [ ] Ao escolher um cliente, buscar `?ref=` e ler `creditCents`.
- [ ] Mostrar o aviso com o botão "Usar crédito" e o campo "Crédito do cliente". O disponível é o saldo + o crédito salvo do pedido em edição.
- [ ] Mostrar a linha no resumo.
- [ ] Pedido com total 0 não exige valor pago.

### Tarefa 5: documentos e Minha conta

- [ ] `Proposal.credit: number` (0 = sem) em `proposal.ts` e `orderDocument.ts`.
- [ ] A linha aparece em `html.ts`, `pdf.tsx` e nos dois textos de WhatsApp.
- [ ] `StaffDocument.credit` (`documentDetails.ts`) e a linha em `StaffDocumentPage`. O subtotal ali soma o crédito.
- [ ] Minha conta, pedidos e orçamentos: campo `credit` e a linha em `AccountOrders`/`AccountQuotes`.
- [ ] Aviso de saldo no alto de `/minha-conta/pedidos`.

### Tarefa 6: verificar e publicar

- [ ] `npx vitest run`, `npx tsc --noEmit`, `npx eslint` nos arquivos mexidos.
- [ ] Teste local (ver memória fare-teste-local) no Chrome: lançar crédito, usar no pedido, cancelar.
- [ ] Commit no `master` e `git push`. O deploy automático na VM do Google leva uns 2 minutos.
