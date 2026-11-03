import { AtendimentoError, messageByExternalId } from "@/lib/atendimento/repository";
import { saveMedia } from "@/lib/atendimento/media";
import { atendimentoDb, json, respondInBackground } from "@/lib/atendimento/server";
import { ensureWhatsAppConversation, parseInbound, receiveWhatsAppMessage, tokenMatches } from "@/lib/atendimento/whatsapp";
import type { MediaKind } from "@/lib/atendimento/types";
import { isCampaignOnlyMode } from "@/lib/siteMode";

export const dynamic = "force-dynamic";

const KINDS = new Set<MediaKind>(["imagem", "video", "audio", "documento", "figurinha"]);

/**
 * A ponte do WhatsApp entrega aqui fotos/arquivos (corpo = o arquivo; dados no cabeçalho x-fare-meta).
 * Fora do proxy do site (ver src/proxy.ts), para arquivos grandes não ficarem inteiros na memória.
 */
export async function POST(request: Request) {
  if (isCampaignOnlyMode()) return json({ error: "Não encontrado." }, 404);
  if (!tokenMatches(request.headers.get("x-fare-token"), process.env.FARE_PONTE_TOKEN?.trim())) return json({ error: "AUTH" }, 401);
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(decodeURIComponent(request.headers.get("x-fare-meta") ?? "")) as Record<string, unknown>;
  } catch {
    return json({ error: "JSON" }, 400);
  }
  if (!request.body) return json({ error: "VAZIO" }, 400);
  try {
    const db = atendimentoDb();
    const check = parseInbound(meta, { file: "-", kind: "documento", mime: "", name: "", size: 0, hasThumb: false });
    const existing = messageByExternalId(db, check.externalId);
    if (existing) return json({ ok: true, conversationId: existing.conversationId, duplicate: true }, 200);
    const conversation = ensureWhatsAppConversation(db, check.chatId, check.phone);
    const kind = typeof meta.kind === "string" && KINDS.has(meta.kind as MediaKind) ? (meta.kind as MediaKind) : undefined;
    const stored = await saveMedia(request.body, {
      conversationId: conversation.id,
      name: typeof meta.fileName === "string" ? meta.fileName : "",
      mime: typeof meta.mime === "string" ? meta.mime : "application/octet-stream",
      kind,
    });
    const media = { ...stored, hasThumb: stored.mime.startsWith("image/") };
    const result = receiveWhatsAppMessage(db, parseInbound(meta, media));
    if (!result.duplicate && !result.fromPhone) respondInBackground(db, result.conversationId);
    return json({ ok: true, ...result }, 201);
  } catch (error) {
    if (error instanceof AtendimentoError) return json({ error: error.code, message: error.message }, 400);
    return json({ error: "ARQUIVO", message: error instanceof Error ? error.message : "Falha ao gravar." }, 400);
  }
}
