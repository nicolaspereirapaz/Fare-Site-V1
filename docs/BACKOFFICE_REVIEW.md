# Revisão adversarial de segurança — Backoffice

Data da revisão: 2026-09-28

## Resumo executivo

Foram encontrados **5 achados**: 1 de severidade alta, 2 médias e 2 baixas. Não foi encontrado caminho atual para uma sessão ausente ou com papel `cliente` ler ou alterar pedidos, nem para `vendedor` cancelar um pedido pela API. O papel e o ator da auditoria vêm da sessão verificada pelo Better Auth; não vêm de `body`, header de papel ou query string. Também não foi encontrada SQL injection nem exposição de custo, estoque ou código interno do fornecedor nas respostas do backoffice.

O risco principal está em `updateOrderStatus`: leitura, validação, atualização e auditoria não formam uma operação atômica/isolada. Duas requisições concorrentes podem validar o mesmo estado antigo e gravar resultados incompatíveis; além disso, uma falha entre o `UPDATE` e o `INSERT` deixa o pedido alterado sem auditoria.

## Achados

### BO-01 — Alta — Transição e auditoria não são atômicas e permitem corrida

- Arquivo e linhas: `src/lib/orders/repository.ts:192-215`; relacionado: `src/lib/backoffice/access.ts:135-145`.
- Categorias: transição inválida/condição de corrida; divergência do contrato.

`updateOrderStatus` executa quatro etapas separadas: lê o pedido (`SELECT`, linhas 194-196), valida o status lido (`transicionarStatusPedido`, linha 201), faz um `UPDATE ... WHERE id = ?` incondicional (linhas 205-207) e só depois insere a auditoria (linhas 209-213). Não há transação, bloqueio ou comparação com o status que foi validado.

Em duas conexões/processos, ambas as requisições podem ler o mesmo status. Exemplo concreto: um pedido em `em_transporte_ou_retirada` recebe simultaneamente `concluido` e, por um admin, `cancelado`. As duas transições são validadas contra o estado antigo. Se `concluido` for gravado primeiro e `cancelado` depois, o segundo `UPDATE` transforma efetivamente `concluido` em `cancelado`, transição que `orderStatus.ts` proíbe. A pré-leitura no handler (`findOrder`, linha 135) não protege a escrita e aumenta a janela TOCTOU.

Há ainda perda de integridade da auditoria: como `UPDATE` e `INSERT` são autocommits separados, qualquer erro ou interrupção entre eles deixa uma transição aceita sem a linha exigida por `docs/BACKOFFICE_CONTRACT.md:67-68`.

**Correção recomendada:** executar leitura do estado atual, validação, escrita e auditoria na mesma transação SQLite, adquirindo o bloqueio de escrita antes da leitura (por exemplo, uma transação imediata). Fazer o `UPDATE` como compare-and-swap (`id` e status anterior na condição), exigir exatamente uma linha alterada e tratar falha da comparação como conflito `409`. Inserir a auditoria antes do commit e fazer rollback integral em qualquer erro. Adicionar teste concorrente com duas conexões ao mesmo arquivo SQLite e teste de rollback quando o `INSERT` de auditoria falhar.

### BO-02 — Média — Histórico não tem ordenação cronológica determinística

- Arquivo e linhas: `src/lib/orders/repository.ts:203-213, 218-223`.
- Teste que evidencia o problema: `src/lib/orders/__tests__/repository.test.ts:163-174`.
- Categorias: máquina de estados/auditoria; divergência do contrato.

O instante é gerado com `new Date().toISOString()`, cuja precisão é de milissegundos. Duas transições rápidas podem receber o mesmo `created_at`. A consulta tenta desempatar por `id` (`ORDER BY created_at ASC, id ASC`), mas o `id` é um `randomUUID()`, portanto não representa a ordem de inserção.

O teste direcionado falhou nesta revisão: esperava `pagamento_confirmado` antes de `aguardando_personalizacao`, mas recebeu a ordem inversa. Isso viola a exigência de auditoria em ordem cronológica de `docs/BACKOFFICE_CONTRACT.md:78` e pode reconstruir incorretamente a sequência de estados.

**Correção recomendada:** adicionar à auditoria um ordinal monotônico gerado pelo banco (por exemplo, chave inteira autoincremental ou sequência por pedido) e ordenar por esse valor. O timestamp pode continuar existindo para exibição, mas não deve usar UUID aleatório como critério de ordem. Cobrir explicitamente duas entradas com o mesmo timestamp.

### BO-03 — Média — Reatribuição/escopo por pedido não existe e a regra não pode ser aplicada

- Arquivo e linhas: `docs/BACKOFFICE_CONTRACT.md:8-10`; `src/lib/orders/repository.ts:24-30`; `src/lib/backoffice/access.ts:114-142`; `src/app/api/backoffice/orders/[code]/route.ts:7-15`.
- Categorias: escalonamento/autorização por objeto; divergência do contrato.

O contrato reserva ao `admin` a capacidade de “reatribuir”, mas `Order` não possui responsável/assignee, não há operação de reatribuição e a autorização do PATCH considera somente o papel global. Depois de validar `vendedor` ou `admin`, qualquer pedido identificado por `orderId` pode ser alterado. Assim, o código não tem como distinguir um pedido atribuído ao vendedor atual de um pedido de outro vendedor.

Pelo texto atual de que `vendedor` “lê pedidos e avança status comerciais”, acesso global pode ser intencional; portanto isto não prova, por si só, um bypass atual. Porém a promessa de reatribuição é inimplementada e qualquer intenção de restringir vendedores aos próprios pedidos está hoje sem enforcement.

**Correção recomendada:** esclarecer no contrato se vendedores operam todos os pedidos ou apenas os atribuídos. Se houver ownership, persistir o responsável, fazer reatribuição em operação exclusiva de admin e aplicar autorização por objeto no servidor/consulta de escrita. Se o acesso for global por design, remover ou especificar precisamente o termo “reatribuir” para que não exista uma regra de segurança impossível de testar.

### BO-04 — Baixa — A UI oferece cancelamento ao vendedor embora a API negue

- Arquivo e linhas: `src/app/backoffice/page.tsx:9-17`; `src/components/BackofficeBoard.tsx:180-227`; proteção efetiva em `src/lib/backoffice/access.ts:130-133`.
- Categorias: escalonamento (UX, sem bypass); divergência do contrato/UI.

A página valida o papel no servidor, mas renderiza `<BackofficeBoard />` sem informar capacidades. O board calcula ações apenas com `podeTransicionarStatusPedido`; como `cancelado` é uma transição de estado válida para estados não terminais, o botão também aparece para `vendedor`. Ao clicar, a API devolve `403`, então não há escalonamento efetivo, mas a UI oferece uma ação que o usuário não pode executar.

**Correção recomendada:** derivar no servidor uma capacidade mínima, como `canCancel`, e usá-la apenas para filtrar a apresentação das ações; manter obrigatoriamente a checagem atual na API. Outra opção é a API devolver ações permitidas já calculadas a partir do papel verificado e do estado atual.

### BO-05 — Baixa — A lista de status é redefinida na migração

- Arquivo e linhas: `src/lib/orders/repository.ts:70-97`, especialmente `78-79`.
- Contrato relacionado: `docs/BACKOFFICE_CONTRACT.md:14-18`.
- Categoria: divergência do contrato.

Embora a lógica importe `StatusPedido` e `transicionarStatusPedido` de `orderStatus.ts`, o `CHECK (status IN (...))` repete manualmente todos os status no repositório. Isso contraria a regra explícita de fonte única. As listas coincidem hoje, mas uma mudança futura em `ORDEM_STATUS_PEDIDO` pode ser aceita pela aplicação e rejeitada pelo banco. Como a migração usa apenas `CREATE TABLE IF NOT EXISTS`, ela também não atualizaria o `CHECK` de uma tabela já criada.

**Correção recomendada:** fazer a migração versionada derivar a restrição da fonte canônica, com escaping controlado de literais internos, e prever migração real da tabela quando o conjunto mudar. Adicionar teste que compare a restrição persistida com `ORDEM_STATUS_PEDIDO`.

## Verificação das categorias solicitadas

### 1. Bypass de autorização — verificado, OK

- GET: `src/lib/backoffice/access.ts:83-92` chama `getSession` com os headers da requisição, devolve `401` sem sessão e `403` fora de `vendedor|admin`, antes de chamar `listOrders`.
- PATCH: `src/lib/backoffice/access.ts:108-117` repete a mesma barreira antes de ler o body ou consultar o pedido.
- As rotas reais injetam `auth.api.getSession`: `src/app/api/backoffice/orders/route.ts:7-10` e `src/app/api/backoffice/orders/[code]/route.ts:7-11`.
- A página também verifica a sessão no Server Component e redireciona não autorizados: `src/app/backoffice/page.tsx:9-15`.

Não foi encontrado caminho atual para `cliente` ou sessão ausente alcançar a leitura ou a mutação de pedidos.

### 2. Escalonamento — cancelamento OK; escopo por pedido requer definição

O cancelamento por vendedor é bloqueado no servidor em `src/lib/backoffice/access.ts:130-133`; a checagem ocorre antes da consulta e da escrita. O `actorId` gravado vem de `session.user.id` (`src/lib/backoffice/access.ts:142`), não do corpo. A exposição indevida do botão é BO-04, sem bypass da API.

Não há conceito de atribuição de pedido para comprovar ou impedir alteração de pedido “de outro vendedor”; veja BO-03. Quanto a pedidos de clientes diferentes, o contrato atual autoriza o vendedor a operar pedidos e `listAllOrders` deliberadamente lista todos.

### 3. Confiança em dado do cliente — verificado, OK

O papel usado para autorização é lido apenas do resultado de `auth.api.getSession` e normalizado para `cliente` se ausente/desconhecido (`src/lib/backoffice/access.ts:28-33, 84-90, 109-115`). A configuração do Better Auth marca `role` com `input: false` e default `cliente` (`src/lib/auth/options.ts:11-18`), impedindo autoatribuição desse campo nos inputs públicos da biblioteca.

O body controla apenas o status pretendido, validado contra `ORDEM_STATUS_PEDIDO` (`src/lib/backoffice/access.ts:119-130`). Não há leitura de papel em body, header customizado ou query string.

### 4. Transições inválidas e corrida — achados BO-01 e BO-02

Em execução sequencial, há whitelist do status no handler (`src/lib/backoffice/access.ts:126-130`) e nova validação da transição no repositório (`src/lib/orders/repository.ts:200-201`). Isso bloqueia transições inválidas comuns. A garantia falha sob concorrência e a auditoria não é atômica/ordenada, conforme BO-01 e BO-02.

### 5. Vazamento de dados sensíveis do fornecedor — verificado, OK

As respostas usam uma projeção explícita (`toBackofficeOrderSummary`, `src/lib/backoffice/access.ts:55-67`) e não serializam o `Order` bruto nem `items_snapshot`. São devolvidos somente os campos previstos no contrato: identificação do pedido, status, meio de pagamento, dados do cliente, quantidade de linhas, total e data.

`QuoteCartItem` contém preço unitário de venda, mas não custo do fornecedor, estoque ou código interno (`src/lib/commerce.ts:1-10`); nem mesmo seus campos são devolvidos pela DTO. O total agregado é exigido pelo contrato. Não foi encontrado vazamento das três classes de dado solicitadas.

### 6. SQL injection — verificado, OK

Todos os valores externos usados nas consultas (`userId`, chave de idempotência, `orderId`, status e `actorId`) são passados por placeholders `?`, por exemplo em `src/lib/orders/repository.ts:143-145, 153-155, 169-171, 194-207, 209-213, 220-222`. Não há concatenação/interpolação de input em SQL. Os templates de migração são estáticos. BO-05 é duplicação da enumeração, não SQL injection.

### 7. Divergências entre contrato e código — achados BO-01 a BO-05

- A atomicidade exigida implicitamente por “toda transição aceita grava auditoria” não é garantida (BO-01).
- A ordem cronológica da auditoria não é determinística (BO-02).
- A capacidade de reatribuir reservada ao admin não está modelada nem implementada (BO-03).
- A UI oferece cancelamento ao vendedor, embora a API corretamente negue (BO-04).
- `repository.ts` redefine a lista cuja fonte deveria ser exclusivamente `orderStatus.ts` (BO-05).

O nome físico do segmento é `[code]`, enquanto o contrato o chama de `[id]`, mas isso não altera a URL efetiva: o valor é repassado a `findOrderById`/`updateOrderStatus`. Foi tratado como diferença nominal sem impacto funcional ou de segurança.

## Evidência de testes

Comando executado:

```text
npm.cmd test -- --run src/lib/backoffice/__tests__/access.test.ts src/lib/orders/__tests__/repository.test.ts src/components/__tests__/BackofficeBoard.test.tsx src/lib/__tests__/authOptions.test.ts
```

Resultado: **33 testes executados; 32 passaram e 1 falhou**. A falha foi `camada de dados do backoffice > devolve o histórico de status em ordem cronológica`, descrita em BO-02. Os testes existentes de 401, 403 para `cliente`, bloqueio de cancelamento por `vendedor`, status fora da lista, transição inválida e `actorId` da sessão passaram. Não existe teste concorrente cobrindo BO-01.
