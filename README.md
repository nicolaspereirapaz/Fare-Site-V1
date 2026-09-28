# Fare Foto

E-commerce em Next.js para fotos, materiais gráficos e brindes personalizados.

## Desenvolvimento local

Requisitos: Node.js 22.13 ou mais recente (o projeto usa `node:sqlite`) e npm.

```bash
npm install
copy .env.example .env.local
npx auth@latest migrate --config src/lib/auth.ts --yes
npm run dev
```

Preencha os placeholders de `.env.local` antes de iniciar. O banco local é criado em `data/farefoto.sqlite`; tanto o banco quanto os arquivos de ambiente reais são ignorados pelo Git.

Abra [http://localhost:3000](http://localhost:3000).

## Verificação

```bash
npm test -- --run
npx tsc --noEmit
npm run lint
npm run build
```

## Autenticação

O cadastro e o login usam Better Auth com e-mail e senha. Novos cadastros recebem o papel `cliente`; os papéis reconhecidos são `cliente`, `vendedor` e `admin`. A página `/minha-conta` e a finalização do carrinho validam a sessão no servidor.

## Pedidos

A finalização exige login, registra a preferência de pagamento e cria um pedido com status inicial `aguardando_pagamento` antes de devolver a URL do WhatsApp. O site não processa pagamentos nesta fase. Cada pedido guarda os snapshots do cliente, itens e configurações, a forma de pagamento e o total em centavos; quando houver preço sob consulta, o total permanece nulo.

A tabela `fare_orders` e seu índice são criados por uma migração idempotente (`runOrderMigrations`) executada automaticamente no primeiro acesso de leitura ou escrita. A restrição única `(user_id, idempotency_key)` impede duplicação em novas tentativas do mesmo checkout sem misturar usuários. A área `/minha-conta` consulta essa tabela usando exclusivamente o ID da sessão validada no servidor.
