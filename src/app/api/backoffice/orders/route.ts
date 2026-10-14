import { database } from "@/lib/auth";
import { staffAuth, staffDatabase } from "@/lib/staff/auth";
import { createListBackofficeOrdersHandler } from "@/lib/backoffice/access";
import { listAllOrders, listOrderStatusHistory } from "@/lib/orders/repository";
import { getOrderFinance } from "@/lib/orders/payments";

export const dynamic = "force-dynamic";

/** Nome de quem mudou a situação (conta da equipe), para o histórico dos detalhes. */
function staffName(actorId: string): string {
  if (actorId === "teste") return "Teste";
  const row = staffDatabase.prepare("SELECT name FROM user WHERE id = ?").get(actorId) as { name: string } | undefined;
  return row?.name ?? "Equipe";
}

export const GET = createListBackofficeOrdersHandler(
  staffAuth.api.getSession,
  () => listAllOrders(database),
  (order) => listOrderStatusHistory(database, order.id).map((entry) => ({
    status: entry.nextStatus,
    from: entry.previousStatus,
    at: entry.createdAt,
    by: staffName(entry.actorId),
  })),
  (order) => getOrderFinance(database, order.id),
);
