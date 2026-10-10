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

## 2026-09-29 — Brindes no site completo (commit 88c100e)

- Preço dos brindes só com login: decidido no servidor (`src/lib/giftPricing.ts`, `pricesVisible` nas rotas `/api/xbz/products*`). Regra = campanha (custo×2 + R$ 100 de frete rateado; faixas 50/100/250/500/1000).
- /brindes lê a cópia local `data/xbz-catalog.sqlite` (a XBZ ao vivo passa de 30s).
- Página do brinde: miniaturas por cor, fundo cinza #f2f2f3 (`.supplier-photo`), botões "Finalizar pedido" (vai para `/carrinho#finalizar`, sem duplicar) e "Adicionar ao carrinho" (aviso `.cart-toast`). Envio de arte removido: combinado no WhatsApp.
- Carrinho: item guarda `pricing {unitSaleCents, freightCents}` e recalcula o valor ao mudar a quantidade; mesmo brinde + cor soma na mesma linha; quantidade digitável (Enter/sair do campo; vazio/0 volta).
- Testes: 188 (vitest), tsc e eslint limpos. Pendente: hospedagem (PC ou VPS) e próximas etapas do site aprovadas pelo usuário.

## 2026-10-08 — Conta, pedidos, orçamentos e senha (commits d9a09d3..e856a9b + pendente)

Commitado: Minha conta com menu lateral (40a56a8), cadastro PF/PJ com CEP (dd80dff), faturamento no pedido
(d058d53), preço do pedido calculado no servidor (bceb343), faturamento no backoffice (1754ec2), troca de
senha (d154cb5), "Só quero um orçamento" + aba Orçamentos (e856a9b).

Sem commit (aguardando revisão do Nicolas):
1. Orçamentos no backoffice: abas Pedidos | Orçamentos em /backoffice; quadro por situação
   (aguardando_resposta → respondido → virou_pedido; encerrado enquanto não virou pedido);
   APIs GET /api/backoffice/quotes e PATCH /api/backoffice/quotes/[id] (só vendedor/admin);
   botão "Responder no WhatsApp" abre conversa com o cliente citando #ORC-XXXXXX.
2. Esqueci minha senha: /esqueci-senha e /redefinir-senha (Better Auth requestPasswordReset/resetPassword;
   link vale 1 h, uso único, derruba todas as sessões). E-mail via Resend quando RESEND_API_KEY e
   EMAIL_FROM existirem; em dev sem chave grava em data/outbox/ (fora do git); em produção sem chave
   só registra erro no log. BETTER_AUTH_URL no .env.local passou a http://192.168.15.234:3000 (antes :3001,
   que gerava link quebrado); em produção deve ser https://www.farefoto.com.br.
3. Status para o cliente: "Aguardando pagamento" → "Pedido enviado" + aviso "A equipe vai confirmar
   valores, prazo e pagamento pelo WhatsApp."; pagamento aparece como "Pagamento: Pix". O backoffice
   continua mostrando "Aguardando pagamento".

Pendências: Pixel da Meta no site completo (adiado pelo usuário), revisão da home/menu, hospedagem,
conta Resend + domínio verificado para o envio real de e-mails.

## 2026-10-09 — Área da equipe separada (/equipe), sem commit

- Painel saiu da loja: `/equipe` (painel), `/equipe/entrar`, `/equipe/convite?token=…`. `/backoffice` redireciona.
- App dividido em dois root layouts: `src/app/(loja)/…` (todas as páginas da loja, URLs iguais) e
  `src/app/(equipe)/…` (layout próprio, sem menu/carrinho/rodapé, `robots: noindex`).
- Login da equipe é outra instância do Better Auth: banco `data/equipe.sqlite` (fora do git), basePath
  `/api/equipe/auth`, cookie `fare-equipe.*`, `disableSignUp`, senha mínima 10, sessão de 12 h.
  As APIs `/api/backoffice/*` aceitam SÓ a sessão da equipe (cliente da loja, mesmo com role=admin, recebe 401).
- Contas por convite no terminal: `npm run equipe -- convidar "Nome" email admin|vendedor` (link uso único, 48 h),
  `npm run equipe -- listar`, `npm run equipe -- remover email`. Reconvidar = trocar papel ou "esqueci a senha".
- Constantes sem dependência de servidor em `src/lib/staff/constants.ts` (o cliente do navegador importa daqui;
  importar `options.ts` no navegador quebra o build por causa de node:fs).
- Login de clientes: mensagens em português ("Senha inválida.", etc.).

## 2026-10-09 — Novas colunas do painel (sem commit)

- Pedido: aguardando_pagamento → criando_arte → em_producao → aguardando_retirada → aguardando_feedback → concluido
  (cancelado só admin, com confirmação; não cancela em aguardando_feedback). Aba Pedidos mostra só as 4 etapas do meio.
- Orçamento: aguardando_orcamento → em_negociacao → aguardando_pagamento → virou_pedido (+ encerrado; volta p/ negociação).
  Aba Orçamentos: 3 colunas; pedidos do site em aguardando_pagamento aparecem na 3ª com a etiqueta "Pedido do site".
- "Pagamento recebido" num orçamento chama `convertQuoteToOrder` (transação): cria o pedido em criando_arte com os mesmos
  itens, grava histórico com o funcionário e liga `fare_quotes.order_id`. Não duplica (409 no 2º clique).
- Migração automática das situações antigas (pedidos e orçamentos), tabelas recriadas com o CHECK novo.
- Dados de teste: `node --no-warnings --import ./scripts/register-resolver.mjs --experimental-strip-types scripts/seed-painel-teste.mts`
  (recria) / `... --remover` (apaga tudo do cliente pedido.teste@exemplo.com).
- 2026-10-09 (cont.): kanban redesenhado (opção A + colunas com borda; detalhes em janela central), botões ← | Avançar,
  voltar 1 etapa permitido (exceto do 1º passo pós-pagamento). Pedidos agora com 6 etapas:
  aguardando_arte → criando_arte → aguardando_producao → em_producao → aguardando_retirada → aguardando_feedback.
  Pagamento recebido cria o pedido em aguardando_arte.
