import { COLUNAS_QUADRO_PEDIDOS } from "@/lib/backoffice/orderStatus";

/**
 * Coluna "Finalizado" do quadro de pedidos (status `concluido`): o pedido fica 24 h à vista e depois
 * some do quadro. Continua no banco, no histórico e na conta do cliente. Conta a partir da ÚLTIMA vez
 * que foi finalizado; finalizado sem data (antigo) não volta para o quadro.
 */
export const FINALIZADO_NO_QUADRO_MS = 24 * 60 * 60 * 1000;

type Entry = { status: string; at: string };

/** Quando o pedido foi finalizado (última entrada `concluido` do histórico). */
export function finalizadoEm(history: readonly Entry[] | undefined): string | null {
  const list = history ?? [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].status === "concluido") return list[index].at;
  }
  return null;
}

/** Horas que faltam para sair do quadro (arredonda para cima; 0 = já saiu). */
export function horasNoQuadro(history: readonly Entry[] | undefined, now: Date): number {
  const at = finalizadoEm(history);
  if (!at) return 0;
  const left = Date.parse(at) + FINALIZADO_NO_QUADRO_MS - now.getTime();
  // Relógio da tela pode estar segundos atrás do servidor: limita a 24 h.
  return left > 0 ? Math.min(24, Math.ceil(left / 3_600_000)) : 0;
}

export function visivelNoQuadroDePedidos(order: { status: string; history?: readonly Entry[] }, now: Date): boolean {
  if (order.status === "concluido") return horasNoQuadro(order.history, now) > 0;
  return (COLUNAS_QUADRO_PEDIDOS as readonly string[]).includes(order.status);
}
