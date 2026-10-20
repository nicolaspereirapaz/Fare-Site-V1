import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { database } from "@/lib/auth";
import { getPhotoOrder, markPhotoFilesDeleted } from "@/lib/photoOrders/repository";
import { getStaffSession } from "@/lib/staff/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

/** "Apagar fotos": tira as fotos (prontas e originais) da pasta do pedido; o PED-XXXXXX.html fica, como registro. */
export async function DELETE(request: Request, context: Context) {
  const session = await getStaffSession(request.headers);
  if (!session) return Response.json({ error: "Entre na área da equipe." }, { status: 401 });
  const order = getPhotoOrder(database, (await context.params).id);
  if (!order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  const keep = `${order.code}.html`;
  for (const entry of await readdir(order.folder).catch(() => [] as string[])) {
    if (entry !== keep) await rm(path.join(order.folder, entry), { recursive: true, force: true });
  }
  markPhotoFilesDeleted(database, order.id);
  return Response.json({ ok: true });
}
