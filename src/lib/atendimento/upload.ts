import { AtendimentoError } from "@/lib/atendimento/repository";
import { acceptedMime, saveMedia, toVoiceNote, type StoredMedia } from "@/lib/atendimento/media";
import { isCampaignOnlyMode } from "@/lib/siteMode";

/**
 * Arquivo enviado pelo navegador (painel ou simulador): corpo = o arquivo;
 * cabeçalhos x-file-name e x-caption codificados com encodeURIComponent.
 */
export async function readBrowserUpload(request: Request, conversationId: string, options: { asDocument?: boolean } = {}) {
  if (isCampaignOnlyMode()) throw new AtendimentoError("CONVERSATION_NOT_FOUND", "Não encontrado.");
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!request.body) throw new AtendimentoError("INVALID_REQUEST", "Arquivo vazio.");
  if (!acceptedMime(mime)) throw new AtendimentoError("INVALID_REQUEST", "Tipo de arquivo não aceito.");
  const decode = (value: string | null) => {
    try {
      return decodeURIComponent(value ?? "");
    } catch {
      return "";
    }
  };
  let stored: StoredMedia;
  try {
    stored = await saveMedia(request.body, {
      conversationId,
      name: decode(request.headers.get("x-file-name")),
      mime,
      kind: options.asDocument ? "documento" : undefined,
    });
  } catch (error) {
    throw new AtendimentoError("INVALID_REQUEST", error instanceof Error ? error.message : "Falha ao gravar o arquivo.");
  }
  // Gravação do painel (webm do navegador) vira mensagem de voz do WhatsApp (ogg/opus).
  try {
    stored = await toVoiceNote(stored);
  } catch (error) {
    throw new AtendimentoError("INVALID_REQUEST", error instanceof Error ? error.message : "Não foi possível converter o áudio.");
  }
  return { media: { ...stored, hasThumb: stored.mime.startsWith("image/") }, caption: decode(request.headers.get("x-caption")).slice(0, 2000) };
}
