import { listQuickReplies, saveQuickReply } from "@/lib/atendimento/repository";
import { atendimentoDb, json, readJson, text, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Mensagens rápidas: uma lista única para toda a equipe. */
export const GET = withStaff(() => json({ quickReplies: listQuickReplies(atendimentoDb()) }));

export const POST = withStaff(async (_staff, request) => {
  const body = await readJson(request);
  const quickReply = saveQuickReply(atendimentoDb(), { shortcut: text(body.shortcut, 40), title: text(body.title, 80), body: text(body.body, 2000) });
  return json({ quickReply }, 201);
});
