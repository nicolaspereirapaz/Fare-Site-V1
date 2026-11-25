import { randomUUID } from "node:crypto";
import { appendMediaPart } from "@/lib/atendimento/media";
import { AtendimentoError } from "@/lib/atendimento/repository";
import { json, withStaff } from "@/lib/atendimento/server";
import { isCampaignOnlyMode } from "@/lib/siteMode";

export const dynamic = "force-dynamic";

/**
 * Parte de um arquivo grande do painel: ?inicio=<bytes já enviados>&parte=<id> (a 1ª vem sem id).
 * Depois da última, o navegador manda a requisição normal de envio com x-parte: <id> e sem corpo.
 * Fora do proxy do site (arquivos grandes), então o bloqueio do modo campanha é feito aqui.
 */
export const POST = withStaff(async (_staff, request) => {
  if (isCampaignOnlyMode()) throw new AtendimentoError("CONVERSATION_NOT_FOUND", "Não encontrado.");
  if (!request.body) throw new AtendimentoError("INVALID_REQUEST", "Arquivo vazio.");
  const params = new URL(request.url).searchParams;
  const id = params.get("parte") ?? randomUUID();
  try {
    await appendMediaPart(id, Number(params.get("inicio")), request.body);
  } catch (error) {
    throw new AtendimentoError("INVALID_REQUEST", error instanceof Error ? error.message : "Falha ao gravar o arquivo.");
  }
  return json({ parte: id });
});
