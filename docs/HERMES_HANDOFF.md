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

## 2026-10-11 — Fornecedores Spot e Asia Import + código Fare Foto (sem commit)

- Fornecedores novos em `src/lib/suppliers/` (`spot.ts` = Spot Gifts/Stricker, `asiaImport.ts`, `catalog.ts`). Credenciais em `.env.local` (`SPOT_*`, `ASIA_*`). Chamar o fornecedor de **Spot** (Stricker é o nome da empresa).
- Catálogo local: tabela `supplier_catalog_products` em `data/xbz-catalog.sqlite`; sincroniza sozinho (Spot 3 h, Asia 2 h) e `npm run fornecedores [-- spot|asia]` força agora. Asia exige POST form-urlencoded.
- Categorias da loja inalteradas (23); a categoria do fornecedor só desempata o que cairia em "Outros".
- Código Fare Foto: `X/S/A` + número (X10001…), tabela `fare_product_codes`, nunca muda. Só cliente cadastrado vê (card, página, busca, WhatsApp). Painel da equipe mostra Fare + código real + SKU (`codes` gravado pelo servidor no item).
- Pendente: filtrar produtos parecidos entre fornecedores (usuário vai escolher o critério); confirmar se o "preço" da Asia é custo de revendedor.
- Filtros do catálogo: `src/lib/catalogQuery.ts` (quantidade por estoque de uma cor, preço por unidade só para cadastrados, ordens relevância/menor/maior preço/cores/nome).
- Fotos: a sincronização da XBZ agora atualiza a foto (antes congelava a da 1ª carga); grupo usa a 1ª cor com foto, ponta de estoque (P@/E@) usa a foto do produto normal, e produto sem foto nenhuma fica oculto até o fornecedor publicar. 3 links de foto da XBZ dão HTTP 500 no CDN deles.
- Verificação diária das fotos: `src/lib/imageHealth.ts` (tabelas `image_health`/`image_check_state` no xbz-catalog.sqlite), roda sozinha 1x/dia em segundo plano; `npm run fotos` força agora. Foto que não abre (2 tentativas) some; produto sem nenhuma foto boa sai da loja e volta quando a foto abrir. `repairImageUrl` corrige links digitados errado pela XBZ (hhttps, link duplicado, "https://.xbzbrindes").
- Formar preço no orçamento (painel → Orçamentos → item → "Formar preço"): `src/lib/backoffice/customization.ts` (Laser R$1 canetas/chaveiros, R$2,50 demais; DTF Têxtil Laraella 58 cm, R$29,90/m fracionado mín. 1 m + R$16; DTF UV FuturaIM folhas 20×28/28×40 com tabela por qtd das fotos do usuário, escolhe a combinação mais barata + R$10; Spot = customizationOptions da API; manual). Preço = (custo produto + personalização) × 2 + R$100 rateado. Vendedor vê o custo. API `src/app/api/backoffice/quotes/[id]/itens/[index]`, UI `src/components/QuoteItemPricing.tsx`, grava `costing` no item (removido se vier do navegador). Personalizações Spot em `spot_customizations` (xbz-catalog.sqlite), 1x/dia; `npm run fornecedores -- spot` também baixa.
- Preço: produto/cor com custo zero ou vazio não aparece na loja. A sincronização da XBZ agora também atualiza o preço (antes congelava o da 1ª carga, 28/09): em 12/10 havia 105 itens com preço desatualizado (20 deles zerados na cópia, ex.: Sacola de Lona 19219 = R$ 21,48 na XBZ). Nome continua o da 1ª carga.
- Asia: a variação com o mesmo código do produto-pai (ex.: GA9130, preço 0, estoque = soma das cores) é linha de total, não cor — ignorada quando há cores com sufixo. Só a GA9130 tinha isso (12/10).

## Orçamento manual e várias gravações (2026-10-12)
- Editor da equipe: `/equipe/orcamentos/novo` e `/equipe/orcamentos/<id>` (componente `src/components/staff/QuoteEditor.tsx`, visual em `docs/mockups/orcamento-manual.html`). Substituiu o diálogo "Formar preço" (API antiga `quotes/[id]/itens/[index]` ainda existe, sem tela).
- APIs: `/api/backoffice/orcamento-editor` (POST cria), `/[id]` (GET/PUT), `/clientes` (GET busca, POST cadastra), `/produtos`, `/previa`. O servidor recalcula tudo (`quoteBuilder.ts`); o navegador manda só produto, cor, quantidade e gravações.
- Preço: (custo + soma das gravações por peça) × 2 + R$ 100 rateado (`calcularItemOrcamento`).
- Clientes do painel: tabela `fare_panel_customers` (`src/lib/customers/repository.ts`); WhatsApp/e-mail/CPF-CNPJ únicos contra contas do site e painel (409 DUPLICATE). Dono do orçamento = `painel:<id>`; aparece em "Minha conta" quando a conta do site tem o mesmo e-mail CONFIRMADO.
- `fare_quotes` ganhou `created_by` (null = site) e `internal_notes`. Card do quadro mostra "Site" ou "Feito por <nome>".
- QA: `scratch/fornecedores/editor_check.js` e `editor_check2.js` (criam vendedor QA; apagar depois `fare_panel_customers`/`fare_quotes` de `@exemplo.com` e `npm run -s equipe -- remover`).

## Proposta, desconto, preço à mão, sem cliente e quadro Trello (2026-10-13)
- Proposta (PDF + WhatsApp): `src/lib/proposals/{proposal.ts,pdf.tsx}`; rota `quotes/[id]/proposta` (só equipe). Botões Aprovar/Falar com atendente vão para o WhatsApp da loja (7703). Nunca leva custo, fornecedor, SKU, observação interna. Enviar move "Aguardando orçamento" → "Em negociação".
- Preço por peça arredondado SEMPRE PARA CIMA no centavo (`unitarioParaCima` em `backoffice/pricing.ts`): site, carrinho, servidor, orçamento e landing do Outubro Rosa (`outubro-rosa/js/core.js`).
- Desconto no total (% ou R$): `src/lib/quotes/discount.ts`; coluna `discount_json` em `fare_quotes` e `fare_orders`; `total_cents` já descontado; o pedido criado no pagamento herda o desconto. Aparece no editor, painel, PDF, WhatsApp e Minha conta.
- Valores digitados à mão (só equipe): `costOverride` (custo do produto), `priceOverride` (preço por peça; margem segue sobre o custo real) e `custoOverride` por gravação. Gravados em `costing.manual` / `gravacoes[].manual`.
- Orçamento sem cliente: dono `sem-cliente` ("Cliente a definir", `NO_CUSTOMER_OWNER` em `quotes/quoteCode.ts`); cliente escolhido depois na edição (só se ainda não tinha). PDF sai sem o bloco "Para".
- Gravação da Spot em níveis Componente → Local → Técnica → Área → Nº de cores (`suppliers/spotOptionPicker.ts`).
- Editor no fluxo da brinde.me: busca → janela "Configuração do produto" (`components/staff/ProductConfigModal.tsx`) → Adicionar; lápis reabre. Tipos/utilidades em `quoteEditorShared.ts`.
- Quadro estilo Trello (`@dnd-kit/core`): arrastar entre colunas; o navegador grava um PATCH por etapa do caminho (`backoffice/boardMoves.ts`), o servidor valida cada um. Cartão sem botões; clique abre o detalhe, que tem "Etapa" + ação final (Concluir pedido / Pagamento recebido). Total por coluna.
- Pagamento: débito saiu dos pedidos novos (`CHECKOUT_PAYMENT_METHODS`); proposta diz "Pix ou boleto faturado".
- QA (scratch/fornecedores): `desconto_check.js`, `modal_check.js`, `kanban_check.js`, `sem_cliente_check.js`, `spot_check.js`, `proposal_check2.js`. Todos criam vendedor QA e apagam o que criaram.
- Pendências do usuário: filtros da busca de produto iguais aos da brinde.me (precisa de prints); hospedagem; e-mail real; preço da Asia; critério de produtos parecidos.

## PRÓXIMO: tela de busca de produto no editor (referência brinde.me) — pedido em 13/10
Pedido do usuário: "Melhore a tela de pesquisa de produto, com opções de filtro de cores e outros filtros; ao clicar em detalhes do produto mostre um popup com foto grande, cores e estoques disponíveis, descrição etc."
Fluxo que ele quer (igual ao sistema brinde.me que usa hoje): busca produto → escolhe → abre a janela "Configuração do produto" (já existe: `components/staff/ProductConfigModal.tsx`) → Adicionar → repete.

Referência — janela "Escolha o produto" da brinde.me (prints enviados em 13/10):
- Janela grande (quase tela cheia). Título "Escolha o produto", X para fechar.
- Coluna esquerda (~240px, fundo lilás bem claro):
  - Campo "Buscar produto..." com lupa.
  - "Filtros":
    - FORNECEDOR: select "Todos os fornecedores" (aqui: XBZ, Spot, Asia).
    - GRUPO DE CORES: select "Todos os grupos" com bolinha colorida ao lado de cada cor (Amarelo, Azul, Azul claro, Bambu, Bege, Bicolor, Bordô, Branco…). Juntar variações ("Azul (tom 2)", "Azul / Prata") no grupo da cor principal.
    - PREÇO: slider de faixa com duas bolinhas + campos "R$ 0" – "R$ 750" (é o CUSTO do fornecedor; só equipe vê).
    - ESTOQUE MÍNIMO: campo "Qualquer ... un." + chips Qualquer | 100+ | 500+ | 1.000+ | 5.000+.
  - Sugestão nossa: também filtro de Categoria (as 23 categorias da loja).
- Topo direito: ordenação "Relevância" (+ menor/maior custo, mais estoque).
- Grade de cards (6 por linha no desktop): foto, nome (cortado com …), código do produto, nome do fornecedor em lilás, custo em negrito, "N em estoque" + ícone (i).
  - Card selecionado: borda verde, check verde no canto, e um botão "Detalhes" (ícone de abrir) em cima da foto + lupa.
- Rodapé: "Página 1 de 273 • 6544 resultados", paginação (Primeira, Anterior, 1 2 3 4 5, Próxima, Última), botões "Voltar" e "Confirmar" (vermelho/laranja).
- Aqui: clicar no card (ou Confirmar) abre a janela de configuração; "Detalhes" abre um popup com foto grande, todas as cores (miniatura + estoque de cada), descrição, categoria, código Fare e do fornecedor, e botão "Usar este produto".
Dados: busca atual em `/api/backoffice/orcamento-editor/produtos?q=` (`quoteBuilderServer.ts`, `catalog.search`), devolve até 12; precisa de paginação + filtros no servidor (catálogo ~4.460 produtos em `data/xbz-catalog.sqlite`). Custo e estoque só para a equipe (nunca no site).

Já feito em 13/10 (não refazer): campos de valor da janela do produto (`MoneyField` em ProductConfigModal.tsx) mostram o valor real e são editáveis com clique/Backspace (custo do produto, custo de cada gravação, preço por peça); digitado fica laranja; vazio volta ao calculado.

Também pendente: teste no navegador do desconto + PDF na tela nova (`scratch/fornecedores/desconto_check.js` ainda usa a tela antiga do editor — adaptar para a janela; `modal_check.js` já usa a janela e serve de modelo). Testes automáticos de desconto/PDF passam (549 no total).
Revisão GPT 6.1 de 13/10: 7 achados, todos corrigidos (commit a74cb6f).
