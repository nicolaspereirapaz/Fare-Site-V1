# Campanha Outubro Rosa — contrato

## Rota pública

- Página: `GET /campanhas/outubro-rosa`
- API interna: `GET /api/campaigns/outubro-rosa/products?page=<n>&limit=<n>`
- O banner fornecido pelo usuário é exibido integralmente e responsivamente.

## Seleção de produtos

- Fonte editorial fixa: os 159 códigos publicados em `https://www.xbzbrindes.com.br/brindes/OUTUBRO-ROSA` na captura de 2026-09-28.
- Dados comerciais, imagens e variações vêm da primeira carga da API XBZ e ficam persistidos em `data/xbz-catalog.sqlite`.
- Visitas de clientes leem somente o SQLite; nunca disparam uma consulta direta ao fornecedor.
- Sincronizações posteriores atualizam somente estoque, confiabilidade e previsão de reposição; metadados e preços existentes permanecem imutáveis.
- O limite é 24 tentativas por dia: 37 min no horário comercial (08h–19h), 75 min à noite (19h–00h) e 240 min na madrugada (00h–08h), no fuso `America/Sao_Paulo`, sempre com bloqueio rígido na 24ª tentativa.
- Produtos novos encontrados numa sincronização são cadastrados integralmente uma única vez.
- Somente famílias ainda disponíveis no banco local são expostas ao cliente.
- O código interno, SKU, preço de custo, estoque exato e identidade do fornecedor não podem aparecer na resposta pública.
- Cada card abre a configuração dentro da própria campanha.

## Carrinho e WhatsApp exclusivos da campanha

- Não alterar o checkout, autenticação, carrinho ou páginas do e-commerce completo.
- A campanha mantém seu próprio carrinho no navegador, isolado por uma chave própria de `localStorage`.
- Cards e configuração permanecem em `/campanhas/outubro-rosa`; a campanha não depende das páginas do catálogo geral.
- O cliente escolhe variação e quantidade e pode reunir vários produtos.
- Finalizar não cria pedido no servidor e não exige autenticação.
- O cliente informa nome, empresa opcional, telefone e observações.
- O navegador gera a mensagem com `buildQuoteMessage` e abre `https://wa.me/5511953147703?...`.
- Nenhum pagamento é realizado no site.

## Responsabilidades de arquivos

- Domínio/API/testes: `src/data/outubroRosaProducts.ts`, `src/lib/campaignProducts.ts`, `src/app/api/campaigns/outubro-rosa/products/route.ts` e testes relacionados.
- UI: `src/app/campanhas/outubro-rosa/page.tsx`, `src/components/OutubroRosaCatalog.tsx`, estilos exclusivos no fim de `src/app/globals.css`.
- Integração final: banner em `public/images/campanhas/outubro-rosa.png`, carrinho, constante central, revisão e execução real.
