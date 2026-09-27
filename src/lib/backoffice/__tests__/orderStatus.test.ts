import { describe, expect, it } from "vitest";
import {
  ORDEM_STATUS_PEDIDO,
  podeTransicionarStatusPedido,
  transicionarStatusPedido,
  type StatusPedido,
} from "../orderStatus";

describe("podeTransicionarStatusPedido / transicionarStatusPedido", () => {
  it.each([
    ["aguardando_personalizacao", "personalizacao_definida"],
    ["personalizacao_definida", "aguardando_pagamento"],
    ["aguardando_pagamento", "pagamento_confirmado"],
    ["pagamento_confirmado", "em_producao"],
    ["em_producao", "pronto_para_envio"],
    ["pronto_para_envio", "enviado"],
    ["enviado", "concluido"],
  ] as const)("permite avançar de %s para %s", (de, para) => {
    expect(podeTransicionarStatusPedido(de, para)).toBe(true);
    expect(transicionarStatusPedido(de, para)).toBe(para);
  });

  it.each([
    ["aguardando_personalizacao", "cancelado"],
    ["personalizacao_definida", "cancelado"],
    ["aguardando_pagamento", "cancelado"],
    ["pagamento_confirmado", "cancelado"],
    ["em_producao", "cancelado"],
  ] as const)("permite cancelar a partir de %s", (de, para) => {
    expect(podeTransicionarStatusPedido(de, para)).toBe(true);
  });

  it.each([
    ["aguardando_personalizacao", "aguardando_pagamento"],
    ["aguardando_personalizacao", "em_producao"],
    ["personalizacao_definida", "personalizacao_definida"],
    ["pagamento_confirmado", "aguardando_pagamento"],
    ["pronto_para_envio", "cancelado"],
    ["enviado", "cancelado"],
    ["enviado", "em_producao"],
    ["concluido", "enviado"],
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
      "aguardando_personalizacao",
      "personalizacao_definida",
      "aguardando_pagamento",
      "pagamento_confirmado",
      "em_producao",
      "pronto_para_envio",
      "enviado",
      "concluido",
      "cancelado",
    ]);
  });
});
