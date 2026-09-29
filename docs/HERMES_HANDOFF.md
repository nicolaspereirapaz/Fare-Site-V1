# Handoff — Fare Foto

## Como continuar

Abra este repositório em outra sessão do Hermes:

`C:\Users\Nicolas\Documents\Dev\fare_new_project`

Peça ao agente para ler primeiro:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PLATFORM_ARCHITECTURE.md`
4. este arquivo
5. `git status` e o diff ainda não commitado

Não descarte nem sobrescreva as alterações locais atuais. Não execute dois agentes editando este repositório ao mesmo tempo.

## Estado confirmado

Último commit estável: `056c245 feat: add customer authentication and protected checkout`.

Já concluído e commitado:

- storefront Next.js;
- catálogo local e catálogo XBZ;
- carrinho e WhatsApp;
- autenticação Better Auth com SQLite;
- cadastro, login e área do cliente;
- compra bloqueada para visitantes;
- regra de preço dos brindes e separação entre frete do fornecedor e frete ao cliente;
- ocultação pública de preço bruto, estoque e códigos internos do fornecedor.

## Fluxo de pedidos — concluído e commitado

Commit: `689948c feat: persist orders with payment method and idempotent checkout`.

Validação executada em 28/09 antes do commit:

- `npm run build`: exit 0, 14 rotas geradas;
- `npm test -- --run`: 19 arquivos, 91 testes aprovados;
- `npx tsc --noEmit` e `npm run lint`: exit 0;
- teste HTTP real em SQLite temporário na porta 3107:
  - checkout sem login → `401`;
  - cadastro → `200`;
  - checkout autenticado → `200`, status `aguardando_pagamento`;
  - POST repetido com a mesma `idempotencyKey` → mesmo `orderId`, **1 linha** em `fare_orders`;
  - URL retornada aponta para `5511953147703` e contém código do pedido e método de pagamento;
  - pedido aparece em `/minha-conta` (`200`);
  - `paymentMethod` inválido → `400`.

Atenção: um banco novo exige `npx auth@latest migrate --config src/lib/auth.ts --yes`
(cria `user`/`session`/`account`/`verification`); a tabela `fare_orders` é criada
automaticamente pelo repositório.

Conteúdo desta fatia:

- persistência SQLite de pedidos em `src/lib/orders/`;
- chave de idempotência para impedir pedidos duplicados;
- meios de pagamento: Pix, crédito, débito, boleto e faturamento empresarial;
- status operacional atualizado;
- checkout criando pedido antes de retornar a URL do WhatsApp;
- histórico real de pedidos em `/minha-conta`;
- testes novos do repositório, checkout, carrinho e área do cliente;
- alterações correspondentes no README e CSS.

## Próxima fatia

Backoffice (aplicação separada, mesmo banco e API), Kanban comercial/produção,
gerador de orçamento HTML/PDF e QA final.

## Regras de negócio confirmadas

- Qualquer compra exige cadastro/login.
- Fotografias podem ter preço público.
- Brindes não mostram preço para visitantes.
- Pagamentos apenas registram preferência nesta fase; o site não processa transações.
- Métodos: Pix, cartão de crédito, cartão de débito, boleto e faturamento para empresas sujeito à aprovação.
- Ao finalizar, o pedido é criado internamente e o próprio cliente envia a mensagem pronta pelo WhatsApp.
- Número Fare Foto: `5511953147703`.
- Perfis internos iniciais: `vendedor` e `admin`.
- Backoffice será uma aplicação separada, compartilhando banco e API com o e-commerce.
- Próximos blocos depois do fluxo de pedidos: backoffice, Kanban comercial/produção, gerador de orçamento HTML/PDF e QA final.

## Fórmula de brindes

```text
precoUnitario = (custoProduto + gravacaoUnitaria) * 2
subtotalProdutos = precoUnitario * quantidade
precoFinal = subtotalProdutos + freteFornecedor
precoUnitarioFinal = precoFinal / quantidade
totalGeral = precoFinal + freteCliente
```

- `freteFornecedor`: fornecedor → Fare Foto, diluído na quantidade e não discriminado ao cliente como origem.
- `freteCliente`: Fare Foto → cliente, discriminado separadamente no orçamento.
- Não existem faixas fixas para brindes; qualquer quantidade inteira positiva é aceita.
- Fotos e produtos gráficos terão regras próprias.

## Modelo de orçamento

Arquivo de referência fornecido pelo usuário:

`C:\Users\Nicolas\AppData\Local\hermes\attachments\#ORC-2026-376.html`

Também foi fornecida uma cópia `#ORC-2026-376-2.html`.
