import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { AtendimentoError, getMessage, mediaFileOf } from "@/lib/atendimento/repository";
import { mediaPath, mediaRetentionDays } from "@/lib/atendimento/media";
import { atendimentoDb, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Abre a foto/arquivo de uma mensagem. ?mini=1 = miniatura; ?baixar=1 = baixa com o nome original. */
export const GET = withStaff(async (_staff, request, context: RouteContext<"/api/atendimento/midia/[id]">) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const stored = mediaFileOf(db, id);
  const message = getMessage(db, id);
  if (!stored || !message?.media) throw new AtendimentoError("CONVERSATION_NOT_FOUND", "Arquivo não encontrado.");
  const params = new URL(request.url).searchParams;
  if (message.media.pruned && (params.get("baixar") === "1" || !message.media.hasThumb)) {
    throw new AtendimentoError("CONVERSATION_NOT_FOUND", `O arquivo original foi apagado (guardamos só ${mediaRetentionDays()} dias).`);
  }
  // Original apagado pela limpeza: mostra a miniatura no lugar.
  const thumb = (params.get("mini") === "1" || Boolean(message.media.pruned)) && message.media.hasThumb;
  let file = mediaPath(stored.file, thumb);
  let info = await stat(file).catch(() => null);
  if (!info && thumb) {
    file = mediaPath(stored.file);
    info = await stat(file).catch(() => null);
  }
  if (!info) throw new AtendimentoError("CONVERSATION_NOT_FOUND", "Arquivo não está mais no disco.");
  const type = thumb ? "image/jpeg" : message.media.mime || "application/octet-stream";
  const name = encodeURIComponent(message.media.name || "arquivo");
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "content-type": type,
      "content-length": String(info.size),
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      // Nunca abre HTML/SVG enviados por clientes como página do site.
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "content-disposition": `${params.get("baixar") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
    },
  });
});
