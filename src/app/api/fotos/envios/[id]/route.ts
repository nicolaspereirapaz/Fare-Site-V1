import { readFile } from "node:fs/promises";
import { readUpload } from "@/lib/photoOrders/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

/** Prévia leve da foto enviada (o id é aleatório e só o cliente que enviou conhece). Serve também para o HEIC. */
export async function GET(_request: Request, context: Context) {
  const upload = await readUpload((await context.params).id);
  if (!upload) return new Response("Não encontrado.", { status: 404 });
  return new Response(new Uint8Array(await readFile(upload.preview)), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" },
  });
}
