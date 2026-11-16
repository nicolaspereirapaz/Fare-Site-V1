# Crédito do cliente — desenho

Data: 16/11/2026

## Por quê

A equipe precisa deixar um valor guardado para o cliente (pagou a mais, troca, defeito, cortesia) e lembrar disso no próximo pedido. Hoje não existe esse controle: fica na cabeça de quem atendeu. O vendedor precisa ser avisado ao montar o pedido, usar o crédito ali, e o cliente paga o restante normalmente.

## Metas

- Na página do cliente (`/equipe/clientes/[ref]`): ver o saldo, lançar crédito e retirar crédito, sempre com motivo, e ver o extrato.
- No editor de pedido/orçamento (`QuoteEditor`): ao escolher um cliente com saldo, mostrar o aviso "Este cliente tem R$ X de crédito" e um botão "Usar crédito".
- O crédito usado entra como **desconto** no pedido, numa **linha própria** "Crédito do cliente", em todo lugar onde já aparecem o desconto e o frete.
- Se o crédito não cobre tudo, o restante é pago pelos meios que já existem (Pix, cartão…).
- O cliente com conta no site vê o saldo em Minha conta.

## Fora do escopo

- Gerar crédito automaticamente (ao cancelar um pedido pago, ou de troco/pagamento a mais).
- Crédito com validade.
- O cliente usar o crédito sozinho no carrinho do site.
- Mostrar o crédito no Atendimento (WhatsApp).

## O que não pode acontecer

- O mesmo crédito ser usado duas vezes (dois pedidos abertos ao mesmo tempo).
- O crédito sumir quando um pedido que o usou é cancelado.
- O saldo ficar negativo.
- Um cliente ver o crédito de outro.

## Restrições

- Só a equipe com papel `vendedor` ou `admin` lança, retira ou usa crédito. É a mesma regra que já vale para criar pedidos (`src/lib/backoffice/access.ts`).
- Como o crédito é desconto, o total do pedido e a nota fiscal saem pelo valor já com o crédito abatido. Essa foi uma escolha do Nicolas.
- Banco SQLite com migração `CREATE TABLE IF NOT EXISTS`/`ALTER` no próprio repositório, como o resto do projeto.

## Caminhos considerados

1. **Crédito guardado junto com o desconto (`discount_json`), linha própria nas telas.** Escolhido. O frete já é guardado assim (`QuoteDiscount.freight`), então o crédito segue o mesmo caminho por orçamento → pedido → edição → documentos sem colunas novas em `fare_orders`. Cada tela que mostra desconto e frete ganha uma linha "Crédito do cliente".
2. **Crédito como forma de pagamento** (entra nos recebimentos e o total não muda). Recusado: o Nicolas quer o crédito como desconto.
3. **Uma linha só "Desconto + crédito".** Era o mais simples, porque nenhuma tela precisaria mudar. Recusado: o Nicolas quer a linha separada, que fica mais clara para o cliente.

## Desenho

### Dados

- Tabela nova `fare_customer_credits`:
  - `id` (TEXT, chave), `owner_id` (TEXT), `amount_cents` (INTEGER, diferente de 0: positivo = lançou, negativo = retirou), `reason` (TEXT, obrigatório), `actor_id`, `actor_name`, `created_at`.
- O uso do crédito num pedido ou orçamento fica em `QuoteDiscount.credit` (em reais, como `freight`). Nada de tabela de uso.
- **Saldo** de um conjunto de donos = soma de `fare_customer_credits.amount_cents` desses donos − soma do `credit` dos pedidos (`fare_orders`) desses donos que **não estão cancelados**. Assim, cancelar um pedido devolve o crédito sem código extra.
- Donos de um cliente: o mesmo que `customerHistory` já usa. Para uma conta: `accountQuoteOwners` (conta + clientes do painel com o mesmo e-mail). Para um cliente do painel: só `painel:<id>`. O lançamento manual grava no `ownerId` do cliente da página.

### Cálculo

- `applyDiscount` passa a devolver também `creditCents`, e `totalCents = subtotal − desconto − crédito + frete`.
- O crédito não pode passar de `subtotal − desconto + frete`. Se passar, aparece o erro "O crédito não pode ser maior que o total."
- `parseDiscount` aceita `credit` (vazio ou 0 = sem crédito; negativo = erro), do mesmo jeito que o frete.
- Helpers novos no estilo de `freightOf`: `creditOf(discount)` em reais.

### Onde o saldo é conferido (no servidor, dentro da mesma transação que grava)

- Ao criar o pedido direto (`createDirectOrder`).
- Ao transformar um orçamento em pedido (`src/lib/quotes/closeQuote.ts`).
- Ao editar os itens ou o desconto de um pedido (`replaceOrderItems`). Aqui o crédito do próprio pedido não conta como gasto ao conferir.
- Se faltar saldo, aparece o erro "Este cliente tem só R$ X de crédito."
- Orçamento salvo com crédito **não** gasta saldo; o saldo é conferido quando o orçamento vira pedido.

### Telas da equipe

**Página do cliente**: um cartão novo "Crédito" entre "Dados do cliente" e "Orçamentos e pedidos".

```
┌ Crédito ─────────────────────────────────────┐
│ Saldo: R$ 80,00                               │
│ [ valor R$ ] [ motivo ...................... ] │
│ [Adicionar crédito] [Retirar crédito]         │
│                                               │
│ 16/11  + R$ 100,00  Pagou a mais (Ana)        │
│ 18/11  − R$ 20,00   Pedido P-1234 (link)      │
└───────────────────────────────────────────────┘
```

- No celular, o valor e o motivo ficam um embaixo do outro, e os botões ocupam a largura toda.
- "Retirar" não deixa o saldo ficar negativo.
- O extrato junta os lançamentos manuais com os pedidos não cancelados que usaram crédito, do mais novo para o mais antigo.

**Editor de pedido/orçamento (`QuoteEditor`)**:
- Com cliente escolhido e saldo maior que zero, aparece o aviso: "Este cliente tem R$ 80,00 de crédito. [Usar crédito]".
- O botão preenche o campo novo "Crédito do cliente" (ao lado de Desconto e Frete) com o menor valor entre o saldo e o total. O vendedor pode mudar o valor.
- No resumo aparece a linha "Crédito do cliente − R$ X".
- O saldo vem de uma rota nova de leitura (`GET`), protegida como as outras do editor.
- Ao editar um pedido que já usou crédito, o saldo mostrado soma de volta o crédito desse pedido.

**Linha "Crédito do cliente − R$ X"**: em todo lugar que hoje mostra desconto e frete:
- `StaffDocumentPage`, `proposals/html.ts`, `proposals/pdf.tsx`, `proposals/comanda.tsx`;
- os textos de WhatsApp (`orderDocument.ts`, `proposal.ts`);
- `documentDetails.ts`, `backoffice/access.ts`, `quotesAccess.ts`;
- Minha conta, pedidos e orçamentos (`AccountOrders`, `AccountQuotes`).

Para achar todos, procure `discountLine`/`freightOf` com grep.

### Minha conta (cliente)

- No alto de `/minha-conta/pedidos`, com saldo maior que zero: "Você tem R$ 80,00 de crédito na Fare Foto. Use no seu próximo pedido com a nossa equipe."
- O saldo usa os donos de `accountQuoteOwners(userId)`.

## Decisões que tomei (confira)

- O crédito não vence.
- Uso parcial: o que sobra fica guardado.
- Um pedido com total zero (pago todo com crédito) entra direto em "aguardando arte", sem exigir recebimento.
- A margem do editor (`quoteBuilderHandlers`) é calculada **sem** o crédito, porque o crédito é uma dívida antiga com o cliente e não uma redução de preço.
- Não deixar apagar um cliente do painel (`deletePanelCustomer`) enquanto ele tiver saldo.
- Limite conhecido: um cliente do painel com o mesmo e-mail de uma conta não vê o crédito lançado na página da conta (a página da conta vê os dois). Isso segue a regra que o histórico já usa.

## Para quem for construir

- Testes de biblioteca (vitest, como em `src/lib/orders/__tests__`): lançar, retirar com e sem saldo, usar no pedido, cancelar devolve, saldo insuficiente bloqueia, edição do pedido sem contar o próprio crédito, e o `applyDiscount` com crédito.
- O texto exato dos avisos e a ordem dos campos no editor ficam a seu critério, seguindo o estilo das telas existentes.
