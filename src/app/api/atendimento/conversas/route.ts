import { aiEnabled, AtendimentoError, listConversations, markAllConversationsRead } from "@/lib/atendimento/repository";
import { atendimentoDb, json, readJson, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Todas as conversas (todos os vendedores veem todas), mais recentes primeiro. */
export const GET = withStaff(() => {
  const db = atendimentoDb();
  return json({ conversations: listConversations(db), aiEnabled: aiEnabled(db) });
});

/** Ação na lista: "todas_lidas" zera as não lidas de todas as conversas. */
export const PATCH = withStaff(async (_staff, request) => {
  const db = atendimentoDb();
  const body = await readJson(request);
  if (body.action !== "todas_lidas") throw new AtendimentoError("INVALID_REQUEST", "Ação desconhecida.");
  markAllConversationsRead(db);
  return json({ conversations: listConversations(db) });
});
