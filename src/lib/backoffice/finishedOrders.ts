import { COLUNAS_QUADRO_PEDIDOS } from "@/lib/backoffice/orderStatus";

/**
 * Coluna "Finalizado" do quadro de pedidos (status `aguardando_retirada`, pedido pronto): fica 10 min à vista
 * e some, para não acumular. O pedido continua achável na tela Retirada até o cliente retirar. Conta a partir
 * da ÚLTIMA vez que entrou em Finalizado; sem data (antigo) não volta para o quadro.
 */
export const FINALIZADO_NO_QUADRO_MS = 10 * 60 * 1000;

type Entry = { status: string; at: string };

/** Quando o pedido entrou em Finalizado (última entrada `aguardando_retirada` do histórico). */
export function finalizadoEm(history: readonly Entry[] | undefined): string | null {
  const list = history ?? [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].status === "aguardando_retirada") return list[index].at;
  }
  return null;
}

/** Minutos que faltam para sair do quadro (arredonda para cima; 0 = já saiu). */
export function minutosNoQuadro(history: readonly Entry[] | undefined, now: Date): number {
  const at = finalizadoEm(history);
  if (!at) return 0;
  const left = Date.parse(at) + FINALIZADO_NO_QUADRO_MS - now.getTime();
  // Relógio da tela pode estar segundos atrás do servidor: limita a 10 min.
  return left > 0 ? Math.min(10, Math.ceil(left / 60_000)) : 0;
}

export function visivelNoQuadroDePedidos(order: { status: string; history?: readonly Entry[] }, now: Date): boolean {
  if (order.status === "aguardando_retirada") return minutosNoQuadro(order.history, now) > 0;
  return (COLUNAS_QUADRO_PEDIDOS as readonly string[]).includes(order.status);
}

/** Aviso "pedido pronto" no WhatsApp: sai 5 min depois de o pedido entrar em Finalizado (`pickupNotice.ts`). */
export const AVISO_APOS_MS = 5 * 60 * 1000;

/** Como está o aviso do cliente, para a equipe ("Cliente avisado no WhatsApp", "Aviso em 3 min"…). */
export function avisoLabel(notice: { state: string; detail: string | null } | null | undefined, history: readonly Entry[] | undefined, now: Date): string {
  if (notice?.state === "enviado") return "Cliente avisado no WhatsApp";
  if (notice?.state === "falhou") return `Aviso não enviado: ${notice.detail ?? "falha no envio"}`;
  if (notice?.state === "pulado") return "Sem aviso automático";
  const at = finalizadoEm(history);
  const left = !notice && at ? Math.ceil((Date.parse(at) + AVISO_APOS_MS - now.getTime()) / 60_000) : 0;
  return left > 0 ? `Aviso no WhatsApp em ${Math.min(5, left)} min` : "Enviando aviso no WhatsApp…";
}
