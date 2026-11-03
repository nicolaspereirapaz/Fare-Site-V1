import { getQuickReply, setQuickReplyMedia } from "@/lib/atendimento/repository";
import { removeMedia } from "@/lib/atendimento/media";
import { atendimentoDb, json, withStaff } from "@/lib/atendimento/server";
import { readBrowserUpload } from "@/lib/atendimento/upload";

export const dynamic = "force-dynamic";

/** Anexo da mensagem rápida (corpo = o arquivo). Fica na pasta "respostas"; troca o anterior. */
export const POST = withStaff(async (_staff, request, context: RouteContext<"/api/atendimento/upload/respostas/[id]">) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  getQuickReply(db, id);
  const { media } = await readBrowserUpload(request, "respostas", { asDocument: request.headers.get("x-original") === "1" });
  const { quickReply, oldFile } = setQuickReplyMedia(db, id, media);
  await removeMedia(oldFile);
  return json({ quickReply }, 201);
});
