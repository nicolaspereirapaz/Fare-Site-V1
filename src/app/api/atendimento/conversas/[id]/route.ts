import { customersForPhone } from "@/lib/atendimento/customer";
import {
  AtendimentoError,
  assumeConversation,
  finishConversation,
  getConversation,
  listMessages,
  markConversationRead,
  moveConversation,
  returnToAi,
  sendToQueue,
} from "@/lib/atendimento/repository";
import { after } from "next/server";
import { activeBrain, atendimentoDb, json, readJson, text, withStaff } from "@/lib/atendimento/server";
import { isAiThinking, runAi } from "@/lib/atendimento/service";
import { isConversationStatus } from "@/lib/atendimento/types";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/atendimento/conversas/[id]">;

/** Conversa aberta: mensagens (só as novas, com ?depois=SEQ) e cadastros do site com o mesmo WhatsApp. */
export const GET = withStaff(async (_staff, request, context: Context) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const conversation = getConversation(db, id);
  const after = Number(new URL(request.url).searchParams.get("depois") ?? 0) || 0;
  const withCustomers = new URL(request.url).searchParams.get("clientes") !== "0";
  return json({
    conversation,
    messages: listMessages(db, id, after),
    customers: withCustomers ? customersForPhone(db, conversation.phone) : undefined,
    aiThinking: isAiThinking(id),
    aiMode: activeBrain().mode,
  });
});

/** Ações: assumir, devolver (para a IA), fila, finalizar, mover (arrastar no quadro) e lida. */
export const PATCH = withStaff(async (staff, request, context: Context) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const body = await readJson(request);
  const force = body.force === true;
  // Voltou para a IA com mensagem do cliente sem resposta: a IA responde em seguida.
  const wakeAi = () => {
    const { brain, name } = activeBrain();
    after(() => runAi(db, id, brain, name).catch((error) => console.error("[atendimento] IA:", error)));
  };
  if (body.action === "devolver" || (body.action === "mover" && body.status === "ia")) wakeAi();
  switch (body.action) {
    case "assumir":
      return json({ conversation: assumeConversation(db, id, staff, { force }) });
    case "devolver":
      return json({ conversation: returnToAi(db, id, staff, text(body.note, 400)) });
    case "fila":
      return json({ conversation: sendToQueue(db, id, staff, "Colocada na fila pela equipe.") });
    case "finalizar":
      return json({ conversation: finishConversation(db, id, staff) });
    case "mover":
      if (!isConversationStatus(body.status)) throw new AtendimentoError("INVALID_REQUEST", "Etapa inválida.");
      return json({ conversation: moveConversation(db, id, body.status, staff, { force }) });
    case "lida":
      markConversationRead(db, id);
      return json({ conversation: getConversation(db, id) });
    default:
      throw new AtendimentoError("INVALID_REQUEST", "Ação desconhecida.");
  }
});
