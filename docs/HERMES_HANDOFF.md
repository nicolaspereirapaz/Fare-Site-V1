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

## Alterações locais ainda não commitadas

O agente anterior implementou parcialmente a próxima fatia antes de atingir limite do provedor:

- persistência SQLite de pedidos em `src/lib/orders/`;
- chave de idempotência para impedir pedidos duplicados;
- meios de pagamento: Pix, crédito, débito, boleto e faturamento empresarial;
- status operacional atualizado;
- checkout criando pedido antes de retornar a URL do WhatsApp;
- histórico real de pedidos em `/minha-conta`;
- testes novos do repositório, checkout, carrinho e área do cliente;
- alterações correspondentes no README e CSS.

Estas alterações foram verificadas após a interrupção:

- `npm test -- --run`: **19 arquivos, 91 testes aprovados**;
- `npx tsc --noEmit`: **exit 0**;
- `npm run lint`: **exit 0**.

Ainda falta executar e corrigir, se necessário:

1. `npm run build` com nenhum `next dev`/`next start` ativo;
2. teste HTTP autenticado completo em banco SQLite temporário;
3. conferir que o pedido aparece em `/minha-conta` e que o POST repetido com a mesma chave não duplica;
4. validar que a URL retornada aponta para `5511977843872` e contém código do pedido e método de pagamento;
5. revisar o diff por segurança e ausência de credenciais;
6. apenas depois, criar um commit para esta fatia.

## Regras de negócio confirmadas

- Qualquer compra exige cadastro/login.
- Fotografias podem ter preço público.
- Brindes não mostram preço para visitantes.
- Pagamentos apenas registram preferência nesta fase; o site não processa transações.
- Métodos: Pix, cartão de crédito, cartão de débito, boleto e faturamento para empresas sujeito à aprovação.
- Ao finalizar, o pedido é criado internamente e o próprio cliente envia a mensagem pronta pelo WhatsApp.
- Número Fare Foto: `5511977843872`.
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
