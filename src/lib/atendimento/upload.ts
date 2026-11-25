import { AtendimentoError } from "@/lib/atendimento/repository";
import { createReadStream, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { acceptedMime, mediaPartPath, mediaPath, saveMedia, toVoiceNote, type StoredMedia } from "@/lib/atendimento/media";
import { isCampaignOnlyMode } from "@/lib/siteMode";

/**
 * Arquivo enviado pelo navegador (painel ou simulador): corpo = o arquivo;
 * cabeçalhos x-file-name e x-caption codificados com encodeURIComponent.
 */
export async function readBrowserUpload(request: Request, conversationId: string, options: { asDocument?: boolean } = {}) {
  if (isCampaignOnlyMode()) throw new AtendimentoError("CONVERSATION_NOT_FOUND", "Não encontrado.");
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  // x-parte: arquivo grande já chegou em partes (/api/atendimento/upload/partes); esta requisição vem sem corpo.
  const partId = request.headers.get("x-parte");
  if (!partId && !request.body) throw new AtendimentoError("INVALID_REQUEST", "Arquivo vazio.");
  if (!acceptedMime(mime)) throw new AtendimentoError("INVALID_REQUEST", "Tipo de arquivo não aceito.");
  const decode = (value: string | null) => {
    try {
      return decodeURIComponent(value ?? "");
    } catch {
      return "";
    }
  };
  let stored: StoredMedia;
  let partFile: string | null = null;
  try {
    partFile = partId ? mediaPartPath(partId) : null;
    const body = partFile ? (Readable.toWeb(createReadStream(partFile)) as unknown as ReadableStream<Uint8Array>) : request.body!;
    stored = await saveMedia(body, {
      conversationId,
      name: decode(request.headers.get("x-file-name")),
      mime,
      kind: options.asDocument ? "documento" : undefined,
    });
  } catch (error) {
    throw new AtendimentoError("INVALID_REQUEST", error instanceof Error ? error.message : "Falha ao gravar o arquivo.");
  } finally {
    if (partFile) await rm(partFile, { force: true });
  }
  // Gravação do painel (webm do navegador) vira mensagem de voz do WhatsApp (ogg/opus).
  try {
    stored = await toVoiceNote(stored);
  } catch (error) {
    throw new AtendimentoError("INVALID_REQUEST", error instanceof Error ? error.message : "Não foi possível converter o áudio.");
  }
  // Miniatura só existe se a foto abriu (HEIC/TIFF etc. ficam com ícone de arquivo).
  return { media: { ...stored, hasThumb: existsSync(mediaPath(stored.file, true)) }, caption: decode(request.headers.get("x-caption")).slice(0, 2000) };
}
