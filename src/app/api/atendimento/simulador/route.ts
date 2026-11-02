import { createConversation, listConversations } from "@/lib/atendimento/repository";
import { atendimentoDb, json, readJson, text, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/**
 * SIMULADOR (teste sem WhatsApp): a equipe faz o papel do cliente.
 * Só para quem está logado na equipe; as conversas ficam marcadas como "simulador".
 */
export const GET = withStaff(() => json({ conversations: listConversations(atendimentoDb(), { channel: "simulador" }) }));

export const POST = withStaff(async (_staff, request) => {
  const body = await readJson(request);
  const conversation = createConversation(atendimentoDb(), { channel: "simulador", phone: text(body.phone, 30), contactName: text(body.name, 80) });
  return json({ conversation }, 201);
});
