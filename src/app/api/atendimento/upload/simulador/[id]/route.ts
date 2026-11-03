import { AtendimentoError, getConversation } from "@/lib/atendimento/repository";
import { atendimentoDb, json, respondInBackground, withStaff } from "@/lib/atendimento/server";
import { recordCustomerMessage } from "@/lib/atendimento/service";
import { readBrowserUpload } from "@/lib/atendimento/upload";

export const dynamic = "force-dynamic";

/** Cliente simulado envia foto/arquivo (para testar mídias sem WhatsApp). */
export const POST = withStaff(async (_staff, request, context: RouteContext<"/api/atendimento/upload/simulador/[id]">) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  if (getConversation(db, id).channel !== "simulador") throw new AtendimentoError("CONVERSATION_NOT_FOUND", "Conversa de simulação não encontrada.");
  const { media, caption } = await readBrowserUpload(request, id);
  const message = recordCustomerMessage(db, id, caption, media);
  respondInBackground(db, id, { transcribeFirst: media.kind === "audio" ? message.id : undefined });
  return json({ status: getConversation(db, id).status }, 201);
});
