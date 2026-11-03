import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { AtendimentoError, getQuickReply } from "@/lib/atendimento/repository";
import { mediaPath } from "@/lib/atendimento/media";
import { atendimentoDb, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Prévia do anexo da mensagem rápida (?mini=1 = miniatura). */
export const GET = withStaff(async (_staff, request, context: RouteContext<"/api/atendimento/respostas/[id]/anexo">) => {
  const { id } = await context.params;
  const reply = getQuickReply(atendimentoDb(), id);
  if (!reply.mediaFile || !reply.media) throw new AtendimentoError("QUICK_REPLY_NOT_FOUND", "Sem anexo.");
  const thumb = new URL(request.url).searchParams.get("mini") === "1" && reply.media.hasThumb;
  const file = mediaPath(reply.mediaFile, thumb);
  const info = await stat(file).catch(() => null);
  if (!info) throw new AtendimentoError("QUICK_REPLY_NOT_FOUND", "Arquivo não está mais no disco.");
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "content-type": thumb ? "image/jpeg" : reply.media.mime || "application/octet-stream",
      "content-length": String(info.size),
      "cache-control": "private, no-cache",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(reply.media.name || "anexo")}`,
    },
  });
});
