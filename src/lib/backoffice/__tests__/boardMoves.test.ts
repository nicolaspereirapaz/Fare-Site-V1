import { describe, expect, it } from "vitest";
import { movePath, reachableColumns } from "@/lib/backoffice/boardMoves";
import { COLUNAS_QUADRO_PEDIDOS, podeTransicionarStatusPedido } from "@/lib/backoffice/orderStatus";
import { canTransitionQuote, QUOTE_BOARD_COLUMNS } from "@/lib/quotes/quoteCode";

describe("arrastar no quadro: caminho de etapas até a coluna de destino", () => {
  it("coluna vizinha: um passo só", () => {
    expect(movePath(COLUNAS_QUADRO_PEDIDOS, "aguardando_arte", "criando_arte", podeTransicionarStatusPedido)).toEqual(["criando_arte"]);
  });

  it("pular colunas para a frente passa por cada etapa (o histórico fica completo)", () => {
    expect(movePath(COLUNAS_QUADRO_PEDIDOS, "aguardando_arte", "em_producao", podeTransicionarStatusPedido))
      .toEqual(["criando_arte", "aguardando_producao", "em_producao"]);
  });

  it("voltar várias colunas também passa por cada etapa", () => {
    expect(movePath(COLUNAS_QUADRO_PEDIDOS, "aguardando_retirada", "criando_arte", podeTransicionarStatusPedido))
      .toEqual(["em_producao", "aguardando_producao", "criando_arte"]);
  });

  it("orçamentos: Aguardando orçamento → Aguardando pagamento passa por Em negociação", () => {
    expect(movePath(QUOTE_BOARD_COLUMNS, "aguardando_orcamento", "aguardando_pagamento", canTransitionQuote))
      .toEqual(["em_negociacao", "aguardando_pagamento"]);
  });

  it("mesma coluna: nada a fazer", () => {
    expect(movePath(QUOTE_BOARD_COLUMNS, "em_negociacao", "em_negociacao", canTransitionQuote)).toEqual([]);
  });

  it("se algum passo não é permitido, recusa o movimento inteiro", () => {
    const onlyForward = (from: string, to: string) => QUOTE_BOARD_COLUMNS.indexOf(to as never) > QUOTE_BOARD_COLUMNS.indexOf(from as never);
    expect(movePath(QUOTE_BOARD_COLUMNS, "aguardando_pagamento", "aguardando_orcamento", onlyForward)).toBeNull();
  });

  it("coluna desconhecida: recusa", () => {
    expect(movePath(QUOTE_BOARD_COLUMNS, "aguardando_orcamento", "virou_pedido" as never, canTransitionQuote)).toBeNull();
  });

  it("colunas para onde o cartão pode ir (para o 'Mover para' da janela)", () => {
    expect(reachableColumns(QUOTE_BOARD_COLUMNS, "em_negociacao", canTransitionQuote)).toEqual(["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"]);
    expect(reachableColumns(COLUNAS_QUADRO_PEDIDOS, "aguardando_arte", podeTransicionarStatusPedido)).toEqual([...COLUNAS_QUADRO_PEDIDOS]);
  });
});
