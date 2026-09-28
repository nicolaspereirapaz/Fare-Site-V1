# Contrato — Backoffice Fare Foto (fatia atual)

Este arquivo é o contrato entre a camada de dados/API e a UI do backoffice.
Ambos os lados devem respeitá-lo exatamente. Não altere este arquivo.

## Papéis

- `cliente` — sem acesso ao backoffice.
- `vendedor` — lê pedidos e avança status comerciais.
- `admin` — tudo que o vendedor faz, mais cancelar e reatribuir.

Fonte: `src/lib/auth/roles.ts`.

## Status e transições

Fonte única: `src/lib/backoffice/orderStatus.ts`
(`ORDEM_STATUS_PEDIDO`, `podeTransicionarStatusPedido`, `transicionarStatusPedido`).
Nenhum outro arquivo deve redefinir a lista de status.

## API HTTP

### GET /api/backoffice/orders

Lista pedidos para o quadro. Exige sessão com papel `vendedor` ou `admin`.

- 401 `{ "error": "AUTH_REQUIRED" }` sem sessão.
- 403 `{ "error": "FORBIDDEN" }` com papel `cliente`.
- 200:

```json
{
  "orders": [
    {
      "id": "uuid",
      "status": "aguardando_pagamento",
      "paymentMethod": "pix",
      "customerName": "Cliente Teste",
      "customerPhone": "11988887777",
      "customerCompany": null,
      "itemCount": 2,
      "total": 250.0,
      "createdAt": "2026-09-28T12:00:00.000Z"
    }
  ],
  "counts": { "aguardando_pagamento": 1 }
}
```

`total` é a soma de `unitPrice * quantity`; itens sem preço contam como 0.
`counts` traz a contagem por status, inclusive status com zero pedidos.
Ordenação: `createdAt` decrescente.

### PATCH /api/backoffice/orders/[id]

Avança o status de um pedido.

Corpo: `{ "status": "pagamento_confirmado" }`

- 401 `{ "error": "AUTH_REQUIRED" }` sem sessão.
- 403 `{ "error": "FORBIDDEN" }` papel `cliente`.
- 403 `{ "error": "FORBIDDEN" }` quando `vendedor` tenta `cancelado` (só `admin` cancela).
- 404 `{ "error": "ORDER_NOT_FOUND" }` id inexistente.
- 400 `{ "error": "INVALID_REQUEST" }` corpo malformado ou status fora da lista.
- 409 `{ "error": "INVALID_TRANSITION" }` transição proibida por `orderStatus.ts`.
- 200 `{ "order": { ...mesmo formato do GET... } }`

Toda transição aceita grava uma linha de auditoria com pedido, status anterior,
status novo, id do usuário e instante.

## Camada de dados

`src/lib/orders/repository.ts` (estender, sem quebrar o que existe):

- `listAllOrders(database)` — todos os pedidos, `createdAt` desc.
- `findOrderById(database, id)` — `Order | null`.
- `updateOrderStatus(database, { orderId, nextStatus, actorId })` — valida a
  transição via `transicionarStatusPedido`, grava auditoria e devolve o `Order`.
- `listOrderStatusHistory(database, orderId)` — auditoria em ordem cronológica.

Tabelas criadas por `runOrderMigrations`, idempotente (`CREATE TABLE IF NOT EXISTS`).

## UI

Rota `/backoffice` — Server Component que exige papel `vendedor` ou `admin`;
quem não tem acesso é redirecionado para `/`.

Quadro Kanban com uma coluna por status de `ORDEM_STATUS_PEDIDO`, cartões com
cliente, telefone, meio de pagamento, total e data. Cada cartão oferece apenas
as transições permitidas pelo status atual. Erro da API aparece na tela e o
quadro é recarregado após cada mudança.

Estilo: reaproveitar as variáveis e classes existentes em `src/app/globals.css`
(mesma identidade visual do site). Sem bibliotecas novas.
