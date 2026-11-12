import { AtendimentoError, messageByExternalId, oldestWhatsAppConversation } from "@/lib/atendimento/repository";
import { existsSync } from "node:fs";
import { mediaPath, mediaRetentionDays, pruneOldMedia, saveMedia } from "@/lib/atendimento/media";
import { atendimentoDb, json, respondInBackground, transcribeInBackground } from "@/lib/atendimento/server";
import { ensureWhatsAppConversation, importWhatsAppHistory, parseInbound, receiveWhatsAppMessage, tokenMatches } from "@/lib/atendimento/whatsapp";
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
    // Histórico antigo: só de contato que já está no painel (não cria conversa nem grava o arquivo à toa).
    const conversation = check.sentAt ? oldestWhatsAppConversation(db, check.chatId, check.phone) : ensureWhatsAppConversation(db, check.chatId, check.phone);
    if (!conversation) return json({ ok: true, conversationId: null, duplicate: false }, 200);
    const kind = typeof meta.kind === "string" && KINDS.has(meta.kind as MediaKind) ? (meta.kind as MediaKind) : undefined;
    const stored = await saveMedia(request.body, {
      conversationId: conversation.id,
      name: typeof meta.fileName === "string" ? meta.fileName : "",
      mime: typeof meta.mime === "string" ? meta.mime : "application/octet-stream",
      kind,
    });
    const media = { ...stored, hasThumb: existsSync(mediaPath(stored.file, true)) };
    const inbound = parseInbound(meta, media);
    if (inbound.sentAt) {
      const imported = importWhatsAppHistory(db, inbound);
      // Mais velha que o prazo das mídias: fica só a miniatura, como as outras (sem esperar a limpeza de 6 em 6 h).
      const days = mediaRetentionDays();
      if (days && Date.parse(inbound.sentAt) < Date.now() - days * 24 * 60 * 60 * 1000) await pruneOldMedia(db, days);
      return json({ ok: true, ...imported }, 201);
    }
    const result = receiveWhatsAppMessage(db, inbound);
    const audioId = !result.duplicate && media.kind === "audio" ? messageByExternalId(db, inbound.externalId)?.id : undefined;
    if (!result.duplicate && !result.fromPhone) respondInBackground(db, result.conversationId, { transcribeFirst: audioId });
    else if (audioId) transcribeInBackground(db, audioId);
    return json({ ok: true, ...result }, 201);
  } catch (error) {
    if (error instanceof AtendimentoError) return json({ error: error.code, message: error.message }, 400);
    return json({ error: "ARQUIVO", message: error instanceof Error ? error.message : "Falha ao gravar." }, 400);
  }
}
