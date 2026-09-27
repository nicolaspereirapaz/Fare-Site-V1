# Plataforma Fare Foto — arquitetura definida

## Aplicações

- **E-commerce:** `fare_new_project` — catálogo público, cadastro do cliente, carrinho, pedidos e área do cliente.
- **Backoffice:** aplicação Next.js separada — uso interno de vendedores e administradores.
- As duas aplicações compartilharão o mesmo banco PostgreSQL e a mesma API de domínio. SQLite poderá ser usado apenas no desenvolvimento local inicial.

## Perfis

- **Cliente:** consulta preços de fotografias sem login; precisa entrar ou se cadastrar para comprar qualquer produto. Preços de brindes ficam disponíveis somente após autenticação.
- **Vendedor:** cria e acompanha orçamentos, atende clientes e movimenta pedidos no Kanban.
- **Administrador:** acesso completo, incluindo usuários, regras comerciais e todos os painéis.

## Pagamentos

O cliente seleciona uma preferência; o site não processará o pagamento nesta fase:

- Pix;
- cartão de crédito;
- cartão de débito;
- boleto bancário;
- faturamento para empresas, sujeito à aprovação.

## Regra de preço dos brindes

Não existem faixas fixas de quantidade. O cliente informa qualquer quantidade inteira positiva e o valor unitário final diminui à medida que o frete do fornecedor é diluído.

```text
precoUnitario = (custoProduto + gravacaoUnitaria) * 2
subtotalProdutos = precoUnitario * quantidade
precoFinal = subtotalProdutos + freteFornecedor
precoUnitarioFinal = precoFinal / quantidade
totalGeral = precoFinal + freteCliente
```

- `freteFornecedor`: transporte do fornecedor até a Fare Foto; compõe o preço final e é diluído na quantidade.
- `freteCliente`: entrega da Fare Foto ao cliente; aparece discriminado no orçamento e é somado ao total geral.
- Fotografias e produtos gráficos terão regras próprias, independentes desta fórmula.
- Custos do fornecedor, gravação e frete do fornecedor são dados internos e não aparecem discriminados ao cliente.

## Fluxo do pedido personalizado

1. Cliente autenticado escolhe produto, quantidade, preço apresentado e preferência de pagamento.
2. O e-commerce cria o pedido na API e o envia ao backoffice.
3. O pedido entra no Kanban interno.
4. O site abre uma mensagem pronta no WhatsApp para o próprio cliente enviar a `(11) 97784-3872`.
5. A equipe confirma o pagamento.
6. Vendedor e cliente definem e aprovam a personalização.
7. O pedido segue para produção.
8. Produção, entrega ou retirada e conclusão são acompanhadas pelo Kanban.

Estados iniciais propostos:

```text
pedido_recebido
aguardando_pagamento
pagamento_confirmado
aguardando_personalizacao
personalizacao_em_aprovacao
personalizacao_aprovada
em_producao
pronto_para_envio
em_transporte_ou_retirada
concluido
cancelado
```

## Orçamentos

- Produtos de brindes são selecionados pelo catálogo integrado do fornecedor.
- O vendedor informa gravação unitária, frete do fornecedor, frete ao cliente, quantidade e condições comerciais.
- O documento segue o modelo `#ORC-2026-376.html` fornecido pelo usuário.
- O orçamento deve mostrar itens, quantidade, preço unitário final, total do item, entrega ao cliente discriminada, total geral, pagamento, validade, observações e termos sobre imagens ilustrativas.
- Saídas: HTML e PDF A4 verificado.
