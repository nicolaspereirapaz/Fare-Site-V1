import { describe, expect, it } from "vitest";
import {
  COLUNAS_QUADRO_PEDIDOS,
  ORDEM_STATUS_PEDIDO,
  podeTransicionarStatusPedido,
  transicionarStatusPedido,
  type StatusPedido,
} from "../orderStatus";

describe("situações do pedido", () => {
  it("lista as situações na ordem do fluxo", () => {
    expect(ORDEM_STATUS_PEDIDO).toEqual([
      "aguardando_pagamento",
      "aguardando_arte",
      "criando_arte",
      "aguardando_producao",
      "em_producao",
      "aguardando_retirada",
      "aguardando_feedback",
      "concluido",
      "cancelado",
    ]);
  });

  it("o quadro de pedidos tem as 7 etapas, da arte ao Finalizado", () => {
    expect(COLUNAS_QUADRO_PEDIDOS).toEqual([
      "aguardando_arte", "criando_arte", "aguardando_producao", "em_producao", "aguardando_retirada", "aguardando_feedback", "concluido",
    ]);
  });

  it("finalizado por engano volta para Aguardando feedback (enquanto está no quadro)", () => {
    expect(podeTransicionarStatusPedido("concluido", "aguardando_feedback")).toBe(true);
  });

  it.each([
    ["aguardando_pagamento", "aguardando_arte"],
    ["aguardando_arte", "criando_arte"],
    ["criando_arte", "aguardando_producao"],
    ["aguardando_producao", "em_producao"],
    ["em_producao", "aguardando_retirada"],
    ["aguardando_retirada", "aguardando_feedback"],
    ["aguardando_feedback", "concluido"],
  ] as const)("avança de %s para %s", (de, para) => {
    expect(podeTransicionarStatusPedido(de, para)).toBe(true);
    expect(transicionarStatusPedido(de, para)).toBe(para);
  });

  it.each(["aguardando_pagamento", "aguardando_arte", "criando_arte", "aguardando_producao", "em_producao", "aguardando_retirada", "aguardando_feedback"] as const)(
    "pode cancelar a partir de %s",
    (de) => {
      expect(podeTransicionarStatusPedido(de, "cancelado")).toBe(true);
    },
  );

  it.each([
    ["aguardando_pagamento", "criando_arte"],
    ["aguardando_arte", "aguardando_pagamento"],
    ["criando_arte", "em_producao"],
    ["aguardando_retirada", "concluido"],
    ["concluido", "cancelado"],
    ["cancelado", "criando_arte"],
  ] as const)("bloqueia %s → %s", (de, para) => {
    expect(podeTransicionarStatusPedido(de, para)).toBe(false);
    expect(() => transicionarStatusPedido(de, para)).toThrow();
  });

  it.each([
    ["criando_arte", "aguardando_arte"],
    ["aguardando_producao", "criando_arte"],
    ["em_producao", "aguardando_producao"],
    ["aguardando_retirada", "em_producao"],
    ["aguardando_feedback", "aguardando_retirada"],
  ] as const)("pode voltar de %s para %s", (de, para) => {
    expect(podeTransicionarStatusPedido(de, para)).toBe(true);
  });

  it("não volta de Aguardando arte para o pagamento (pedido já pago)", () => {
    expect(podeTransicionarStatusPedido("aguardando_arte", "aguardando_pagamento")).toBe(false);
  });

  it("cancelado é final; finalizado só volta para Aguardando feedback", () => {
    const finais: StatusPedido[] = ["cancelado"];
    for (const estado of finais) {
      for (const alvo of ORDEM_STATUS_PEDIDO) expect(podeTransicionarStatusPedido(estado, alvo)).toBe(false);
    }
    for (const alvo of ORDEM_STATUS_PEDIDO) {
      expect(podeTransicionarStatusPedido("concluido", alvo)).toBe(alvo === "aguardando_feedback");
    }
  });
});
