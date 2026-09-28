import { auth, database } from "@/lib/auth";
import { createListBackofficeOrdersHandler } from "@/lib/backoffice/access";
import { listAllOrders } from "@/lib/orders/repository";

export const dynamic = "force-dynamic";

export const GET = createListBackofficeOrdersHandler(
  auth.api.getSession,
  () => listAllOrders(database),
);
