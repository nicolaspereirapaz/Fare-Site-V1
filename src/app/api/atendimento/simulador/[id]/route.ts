import { getConversation, listMessages } from "@/lib/atendimento/repository";
import { atendimentoDb, json, readJson, text, withStaff } from "@/lib/atendimento/server";
import { receiveCustomerMessage } from "@/lib/atendimento/service";
import { simulatedBrain } from "@/lib/atendimento/simulatedBrain";
import { AtendimentoError } from "@/lib/atendimento/repository";

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
  const after = Number(new URL(request.url).searchParams.get("depois") ?? 0) || 0;
  const messages = listMessages(atendimentoDb(), id, after)
    .filter((message) => message.author !== "sistema")
    .map(({ seq, id: messageId, author, deliveredText, createdAt }) => ({ seq, id: messageId, fromCustomer: author === "cliente", text: deliveredText, createdAt }));
  const lastSeq = listMessages(atendimentoDb(), id, after).at(-1)?.seq ?? after;
  return json({ conversation: { id: conversation.id, phone: conversation.phone, contactName: conversation.contactName }, messages, lastSeq });
});

/** Cliente simulado envia uma mensagem; a IA de teste responde se a conversa estiver com ela. */
export const POST = withStaff(async (_staff, request, context: Context) => {
  const { id } = await context.params;
  simulatedConversation(id);
  const body = await readJson(request);
  const { conversation } = await receiveCustomerMessage(atendimentoDb(), id, text(body.text, 2000), simulatedBrain);
  return json({ status: conversation.status }, 201);
});
