import { describe, expect, it } from "vitest";
import {
  ORDEM_STATUS_PEDIDO,
  podeTransicionarStatusPedido,
  transicionarStatusPedido,
  type StatusPedido,
} from "../orderStatus";

describe("podeTransicionarStatusPedido / transicionarStatusPedido", () => {
  it.each([
    ["aguardando_pagamento", "pagamento_confirmado"],
    ["pagamento_confirmado", "aguardando_personalizacao"],
    ["aguardando_personalizacao", "personalizacao_em_aprovacao"],
    ["personalizacao_em_aprovacao", "personalizacao_aprovada"],
    ["personalizacao_aprovada", "em_producao"],
    ["em_producao", "pronto_para_envio"],
    ["pronto_para_envio", "em_transporte_ou_retirada"],
    ["em_transporte_ou_retirada", "concluido"],
  ] as const)("permite avançar de %s para %s", (de, para) => {
    expect(podeTransicionarStatusPedido(de, para)).toBe(true);
    expect(transicionarStatusPedido(de, para)).toBe(para);
  });

  it.each([
    ["aguardando_pagamento", "cancelado"],
    ["pagamento_confirmado", "cancelado"],
    ["aguardando_personalizacao", "cancelado"],
    ["personalizacao_em_aprovacao", "cancelado"],
    ["personalizacao_aprovada", "cancelado"],
    ["em_producao", "cancelado"],
    ["pronto_para_envio", "cancelado"],
    ["em_transporte_ou_retirada", "cancelado"],
  ] as const)("permite cancelar a partir de %s", (de, para) => {
    expect(podeTransicionarStatusPedido(de, para)).toBe(true);
  });

  it.each([
    ["aguardando_personalizacao", "aguardando_pagamento"],
    ["aguardando_personalizacao", "em_producao"],
    ["personalizacao_aprovada", "personalizacao_aprovada"],
    ["pagamento_confirmado", "aguardando_pagamento"],
    ["em_transporte_ou_retirada", "em_producao"],
    ["concluido", "em_transporte_ou_retirada"],
    ["concluido", "cancelado"],
    ["cancelado", "aguardando_personalizacao"],
    ["cancelado", "em_producao"],
  ] as const)("bloqueia transição inválida de %s para %s", (de, para) => {
    expect(podeTransicionarStatusPedido(de, para)).toBe(false);
    expect(() => transicionarStatusPedido(de, para)).toThrow();
  });

  it("concluido e cancelado são estados terminais (sem transições de saída)", () => {
    const terminais: StatusPedido[] = ["concluido", "cancelado"];
    for (const estado of terminais) {
      for (const alvo of ORDEM_STATUS_PEDIDO) {
        expect(podeTransicionarStatusPedido(estado, alvo)).toBe(false);
      }
    }
  });

  it("lista todos os estados esperados do fluxo", () => {
    expect(ORDEM_STATUS_PEDIDO).toEqual([
      "aguardando_pagamento",
      "pagamento_confirmado",
      "aguardando_personalizacao",
      "personalizacao_em_aprovacao",
      "personalizacao_aprovada",
      "em_producao",
      "pronto_para_envio",
      "em_transporte_ou_retirada",
      "concluido",
      "cancelado",
    ]);
  });
});
