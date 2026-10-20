# Ficha técnica na consulta da equipe

Implementada abaixo da foto do produto, nas consultas de orçamento e pedido.

- Descrição real da variante/produto do catálogo local.
- Descrições longas podem ser expandidas com Ver mais/Ver menos.
- Área de gravação SPOT aparece somente quando corresponde à opção escolhida e registrada no item.
- Material e dimensões não são campos estruturados no catálogo atual: não são inferidos nem inventados. Se constarem da descrição original, o texto é preservado.
- Não altera snapshot, quantidade, gravação, custo ou preço salvo; não adiciona informações ao PDF comercial.

## Verificação executada

- 729 testes da suíte passaram; build TypeScript/Next e ESLint direcionado passaram.
- 15 verificações reais via HTTP/navegador, em bancos isolados.
- Orçamento e pedido com três itens, todos criados pelas APIs do editor e com preços calculados pelo servidor:
  1. SQUEEZE ALUMÍNIO 420ML — Laser, Frente.
  2. CADERNETA EMBORRACHADA — DTF UV, Capa, 8,5 × 5 cm.
  3. Lápis com borracha — Tampografia, Corpo; área real do fornecedor 40 × 5 mm.
- Descrições e campos correspondem a cada produto; ausência de overflow em desktop e celular de 390px.
- Releitura SQLite confirmou três técnicas distintas persistidas. Hashes das linhas reais de pedidos e orçamentos permaneceram iguais ao baseline anterior ao teste.
- Site principal respondeu HTTP 200 em localhost e LAN.

Evidências locais (scratch, temporárias): `C:/Users/Nicolas/AppData/Local/hermes/profiles/dev-profile/cache/scratch/three-products-qa/` (results.json, scenario.json, screenshots e relatórios). Credenciais e bancos de teste são removidos após a verificação.
