import { describe, expect, it } from "vitest";
import { FINALIZADO_NO_QUADRO_MS, finalizadoEm, minutosNoQuadro, visivelNoQuadroDePedidos } from "@/lib/backoffice/finishedOrders";

/* Coluna "Finalizado" (pedido pronto): fica 10 min no quadro e depois some (continua na tela Retirada). */

const AGORA = new Date("2026-10-14T15:00:00.000Z");
const minAtras = (m: number) => new Date(AGORA.getTime() - m * 60_000).toISOString();
const pedido = (status: string, history: Array<{ status: string; at: string }> = []) => ({ status, history });

describe("pedido finalizado no quadro", () => {
  it("10 minutos exatos", () => {
    expect(FINALIZADO_NO_QUADRO_MS).toBe(10 * 60 * 1000);
  });

  it("aparece por 10 min depois de finalizado e depois some", () => {
    expect(visivelNoQuadroDePedidos(pedido("aguardando_retirada", [{ status: "aguardando_retirada", at: minAtras(1) }]), AGORA)).toBe(true);
    expect(visivelNoQuadroDePedidos(pedido("aguardando_retirada", [{ status: "aguardando_retirada", at: minAtras(9.9) }]), AGORA)).toBe(true);
    expect(visivelNoQuadroDePedidos(pedido("aguardando_retirada", [{ status: "aguardando_retirada", at: minAtras(10) }]), AGORA)).toBe(false);
    expect(visivelNoQuadroDePedidos(pedido("aguardando_retirada", [{ status: "aguardando_retirada", at: minAtras(600) }]), AGORA)).toBe(false);
  });

  it("finalizado sem data (antigo) não volta para o quadro", () => {
    expect(visivelNoQuadroDePedidos(pedido("aguardando_retirada"), AGORA)).toBe(false);
  });

  it("conta a partir da ÚLTIMA vez que foi finalizado (voltou e finalizou de novo)", () => {
    const history = [
      { status: "aguardando_retirada", at: minAtras(30) },
      { status: "em_producao", at: minAtras(29) },
      { status: "aguardando_retirada", at: minAtras(2) },
    ];
    expect(finalizadoEm(history)).toBe(minAtras(2));
    expect(visivelNoQuadroDePedidos(pedido("aguardando_retirada", history), AGORA)).toBe(true);
    expect(minutosNoQuadro(history, AGORA)).toBe(8);
  });

  it("minutos que faltam arredondam para cima; relógio da tela atrasado nunca passa de 10", () => {
    expect(minutosNoQuadro([{ status: "aguardando_retirada", at: minAtras(9.5) }], AGORA)).toBe(1);
    expect(minutosNoQuadro([{ status: "aguardando_retirada", at: minAtras(0) }], AGORA)).toBe(10);
    expect(minutosNoQuadro([{ status: "aguardando_retirada", at: minAtras(-0.5) }], AGORA)).toBe(10);
  });

  it("as outras etapas do quadro sempre aparecem; pagamento pendente, entregue e cancelado nunca", () => {
    for (const status of ["aguardando_arte", "criando_arte", "aguardando_producao", "em_producao"]) {
      expect(visivelNoQuadroDePedidos(pedido(status), AGORA)).toBe(true);
    }
    for (const status of ["aguardando_pagamento", "aguardando_feedback", "concluido", "cancelado"]) {
      expect(visivelNoQuadroDePedidos(pedido(status, [{ status, at: minAtras(1) }]), AGORA)).toBe(false);
    }
  });
});
