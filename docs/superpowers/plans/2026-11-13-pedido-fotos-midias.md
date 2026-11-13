# Pedido de fotos pela janela de Mídias — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mídias cria o pedido e abre o link de fotos em modo equipe (vários tamanhos, valor, editor, Duplicar), que termina levando ao pedido para preço/desconto e pagamento.

**Architecture:** Reaproveita o link de fotos (`/fotos/<token>`). O servidor devolve o endereço do link ao criar o pedido pela conversa; a página do link detecta sessão da equipe e liga um modo equipe nos componentes do link (`LinkStatus`, `LinkSummary`, `Workspace`).

**Tech Stack:** Next.js (app router, versão do repo), React client components, node:sqlite, vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-pedido-fotos-midias-design.md`

## Global Constraints
- Textos em pt-BR, no tom das telas atuais.
- Cliente que abre o link sem sessão da equipe vê exatamente a tela de hoje.
- Endereço interno do pedido (`/equipe/pedidos/<id>`) só vai para a página quando há sessão da equipe.
- Sem dependência nova.

## Review Focus
- Mesma foto duplicada em 2 tamanhos e salva: pedido com as 2 linhas e 2 originais na pasta (teste na Task 1).
- Link aberto pelo cliente (sem sessão): nada de "Duplicar", "Salvar fotos no pedido" ou link do pedido (conferir no navegador, Task 3).
- Navegador bloqueando a aba nova: abrir a aba no clique, antes do `await` (Task 2).
- Pedido sem `orderId` (não deveria acontecer): Mídias mostra o pedido criado sem o botão do editor (Task 2).
- Link de orçamento que virou pedido: endereço da equipe aponta para o pedido (Task 1).

---

### Task 1: servidor — endereço do link e do documento

**Files:**
- Modify: `src/lib/photoLinks/links.ts` (nova função exportada)
- Modify: `src/lib/atendimento/photoOrder.ts` (`createChatPhotoOrder` devolve `linkUrl`)
- Test: `src/lib/photoLinks/__tests__/photoLinks.test.ts`

**Interfaces:**
- Produces: `photoLinkStaffUrl(database: DatabaseSync, token: string): string | null` → `/equipe/pedidos/<id>` ou `/equipe/orcamentos/<id>` (orçamento que virou pedido → pedido); token inválido → `null`.
- Produces: resposta de `POST /api/atendimento/conversas/[id]/pedido-fotos` ganha `linkUrl: string | null` (`/fotos/<token>?editar=1`).

- [ ] Teste: `photoLinkStaffUrl` para pedido, orçamento e token inválido.
- [ ] Teste: `submitPhotoLink` com o mesmo `uploadId` em `10x15` (2 cópias) e `20x30` (1 cópia) → itens "Revelação 10 × 15 cm · papel Brilho" qtd 2 e "Ampliação 20 × 30 cm · papel Brilho" qtd 1; `Originais` com 2 arquivos.
- [ ] Rodar: `npx vitest run src/lib/photoLinks` → falha (função não existe).
- [ ] Implementar `photoLinkStaffUrl` (usa `findLink` + `loadDocument`) e `linkUrl` em `createChatPhotoOrder` (`createPhotoLink(db, "order", orderId, staff.name)`).
- [ ] Rodar de novo → passa.

### Task 2: Mídias — formulário curto que abre o editor

**Files:**
- Modify: `src/components/staff/atendimento/PhotoOrderForm.tsx`

- [ ] Tirar "Cópias de cada" e "Ajuste" (servidor já usa 1 e preencher por padrão). Ficam Cliente, Tamanho, Papel, Entrega.
- [ ] Botão "Criar e abrir editor": `window.open("about:blank", "_blank")` no clique; depois do POST, `tab.location.href = linkUrl` (ou fecha a aba se não veio `linkUrl`/erro).
- [ ] Tela de criado: "Pedido X criado — o editor abriu em outra aba." + "Abrir editor" (linkUrl) + "Abrir pedido" + "Fechar".

### Task 3: link em modo equipe + Duplicar

**Files:**
- Modify: `src/app/(link)/fotos/[token]/page.tsx` (sessão da equipe → `staffUrl`)
- Modify: `src/components/fotos/PhotoLinkPage.tsx` (repassa `staffUrl`)
- Modify: `src/components/fotos/LinkSummary.tsx` (`PhotoLinkProps.staffUrl: string | null`; textos)
- Modify: `src/components/fotos/Workspace.tsx` (botão Duplicar só com `link?.staffUrl`)

**Interfaces:**
- Consumes: `photoLinkStaffUrl` (Task 1).
- Produces: `PhotoLinkProps.staffUrl: string | null` — não nulo = modo equipe.

- [ ] `LinkStatus` em modo equipe: carregando "Abrindo as fotos do pedido X…"; depois de salvar "Fotos salvas no pedido X" + "Abrir pedido (preço e pagamento)" (`staffUrl`) + "Editar fotos de novo".
- [ ] `LinkSummary` em modo equipe: título "Pedido X · Cliente", botão "Salvar fotos no pedido", sem "O valor final é confirmado pela loja.", dica "Preço por tamanho e desconto: no pedido, depois de salvar."
- [ ] Workspace: botão "Duplicar" no card (ícone Copy) insere `{ ...photo, id: novo }` logo depois da original.
- [ ] `npx tsc --noEmit` e `npx eslint` nos arquivos → sem erro.

### Task 4: verificação e publicação
- [ ] `npx vitest run src/lib/photoLinks src/lib/atendimento src/components/staff` → passa (falhas antigas conhecidas fora disso).
- [ ] Teste local (banco copiado, `FARE_FULL_SITE=1`, `-H 127.0.0.1`): Mídias → criar → editor em modo equipe → Duplicar em outro tamanho → salvar → abrir pedido; o mesmo link numa aba anônima mostra a tela do cliente.
- [ ] Commit só dos arquivos desta tarefa (as páginas de segmentos ficam fora) e `git push` (VM publica sozinha em ~2 min).
- [ ] Conferir o site no ar respondendo 200.
