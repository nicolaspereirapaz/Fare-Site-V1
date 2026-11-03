import { AtendimentoError, getConversation, listMessages } from "@/lib/atendimento/repository";
import { activeBrain, atendimentoDb, json, readJson, respondInBackground, text, withStaff } from "@/lib/atendimento/server";
import { isAiThinking, recordCustomerMessage } from "@/lib/atendimento/service";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/atendimento/simulador/[id]">;

function simulatedConversation(id: string) {
  const conversation = getConversation(atendimentoDb(), id);
  if (conversation.channel !== "simulador") throw new AtendimentoError("CONVERSATION_NOT_FOUND", "Conversa de simulação não encontrada.");
  return conversation;
}

/** O que o cliente veria no celular: sem avisos internos, e com a assinatura do vendedor. */
export const GET = withStaff(async (_staff, request, context: Context) => {
  const { id } = await context.params;
  const conversation = simulatedConversation(id);
  const since = Number(new URL(request.url).searchParams.get("depois") ?? 0) || 0;
  const all = listMessages(atendimentoDb(), id, since);
  const messages = all
    .filter((message) => message.author !== "sistema")
    .map(({ seq, id: messageId, author, deliveredText, media, createdAt }) => ({ seq, id: messageId, fromCustomer: author === "cliente", text: deliveredText, media, createdAt }));
  return json({
    conversation: { id: conversation.id, phone: conversation.phone, contactName: conversation.contactName },
    messages,
    lastSeq: all.at(-1)?.seq ?? since,
    typing: isAiThinking(id),
    aiMode: activeBrain().mode,
  });
});

/** Cliente simulado envia uma mensagem: gravada na hora; a IA responde em segundo plano. */
export const POST = withStaff(async (_staff, request, context: Context) => {
  const { id } = await context.params;
  simulatedConversation(id);
  const body = await readJson(request);
  const db = atendimentoDb();
  recordCustomerMessage(db, id, text(body.text, 2000));
  respondInBackground(db, id);
  return json({ status: getConversation(db, id).status }, 201);
});
