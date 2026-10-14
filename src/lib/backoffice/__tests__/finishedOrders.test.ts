import { describe, expect, it } from "vitest";
import { FINALIZADO_NO_QUADRO_MS, finalizadoEm, horasNoQuadro, visivelNoQuadroDePedidos } from "@/lib/backoffice/finishedOrders";

/* Coluna "Finalizado": o pedido fica 24 h no quadro e depois some (continua no banco e na conta do cliente). */

const AGORA = new Date("2026-10-14T15:00:00.000Z");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();
const pedido = (status: string, history: Array<{ status: string; at: string }> = []) => ({ status, history });

describe("pedido finalizado no quadro", () => {
  it("24 horas exatas", () => {
    expect(FINALIZADO_NO_QUADRO_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("aparece por 24 h depois de finalizado e depois some", () => {
    expect(visivelNoQuadroDePedidos(pedido("concluido", [{ status: "concluido", at: horasAtras(1) }]), AGORA)).toBe(true);
    expect(visivelNoQuadroDePedidos(pedido("concluido", [{ status: "concluido", at: horasAtras(23.9) }]), AGORA)).toBe(true);
    expect(visivelNoQuadroDePedidos(pedido("concluido", [{ status: "concluido", at: horasAtras(24) }]), AGORA)).toBe(false);
    expect(visivelNoQuadroDePedidos(pedido("concluido", [{ status: "concluido", at: horasAtras(72) }]), AGORA)).toBe(false);
  });

  it("finalizado sem data (antigo) não volta para o quadro", () => {
    expect(visivelNoQuadroDePedidos(pedido("concluido"), AGORA)).toBe(false);
  });

  it("conta a partir da ÚLTIMA vez que foi finalizado (voltou e finalizou de novo)", () => {
    const history = [
      { status: "concluido", at: horasAtras(30) },
      { status: "aguardando_feedback", at: horasAtras(29) },
      { status: "concluido", at: horasAtras(2) },
    ];
    expect(finalizadoEm(history)).toBe(horasAtras(2));
    expect(visivelNoQuadroDePedidos(pedido("concluido", history), AGORA)).toBe(true);
    expect(horasNoQuadro(history, AGORA)).toBe(22);
  });

  it("horas que faltam arredondam para cima (nunca mostra 0 h enquanto aparece)", () => {
    expect(horasNoQuadro([{ status: "concluido", at: horasAtras(23.5) }], AGORA)).toBe(1);
    expect(horasNoQuadro([{ status: "concluido", at: horasAtras(0) }], AGORA)).toBe(24);
  });

  it("relógio da tela atrasado em relação ao servidor: nunca passa de 24 h", () => {
    expect(horasNoQuadro([{ status: "concluido", at: horasAtras(-0.02) }], AGORA)).toBe(24);
  });

  it("as outras etapas do quadro sempre aparecem; pagamento pendente e cancelado nunca", () => {
    for (const status of ["aguardando_arte", "criando_arte", "aguardando_producao", "em_producao", "aguardando_retirada", "aguardando_feedback"]) {
      expect(visivelNoQuadroDePedidos(pedido(status), AGORA)).toBe(true);
    }
    expect(visivelNoQuadroDePedidos(pedido("aguardando_pagamento"), AGORA)).toBe(false);
    expect(visivelNoQuadroDePedidos(pedido("cancelado", [{ status: "cancelado", at: horasAtras(1) }]), AGORA)).toBe(false);
  });
});
