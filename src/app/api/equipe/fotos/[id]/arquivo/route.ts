import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { database } from "@/lib/auth";
import { getPhotoOrder } from "@/lib/photoOrders/repository";
import { getStaffSession } from "@/lib/staff/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

/**
 * Arquivo de dentro da pasta do pedido, só para a equipe: ?arquivo=10x15 Brilho/foto-01 (1 copia).jpg
 * Com &largura=320 devolve uma miniatura (para a tela da equipe não baixar o arquivo de impressão inteiro).
 */
export async function GET(request: Request, context: Context) {
  const session = await getStaffSession(request.headers);
  if (!session) return new Response("Entre na área da equipe.", { status: 401 });
  const order = getPhotoOrder(database, (await context.params).id);
  if (!order) return new Response("Pedido não encontrado.", { status: 404 });
  const url = new URL(request.url);
  const relative = url.searchParams.get("arquivo") ?? "";
  const file = path.resolve(order.folder, relative);
  // Nunca sai da pasta do pedido.
  if (!relative || !file.startsWith(path.resolve(order.folder) + path.sep)) return new Response("Arquivo inválido.", { status: 400 });
  try {
    if (file.endsWith(".html")) return new Response(new Uint8Array(await readFile(file)), { headers: { "content-type": "text/html; charset=utf-8" } });
    const width = Number(url.searchParams.get("largura"));
    const body = width > 0
      ? await sharp(file).resize(Math.min(width, 1200), Math.min(width, 1200), { fit: "inside" }).jpeg({ quality: 80 }).toBuffer()
      : await readFile(file);
    return new Response(new Uint8Array(body), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=300" } });
  } catch {
    return new Response("Arquivo não encontrado (as fotos podem ter sido apagadas).", { status: 404 });
  }
}
