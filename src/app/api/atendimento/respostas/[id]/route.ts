import { deleteQuickReply, saveQuickReply } from "@/lib/atendimento/repository";
import { atendimentoDb, json, readJson, text, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/atendimento/respostas/[id]">;

export const PATCH = withStaff(async (_staff, request, context: Context) => {
  const { id } = await context.params;
  const body = await readJson(request);
  const quickReply = saveQuickReply(atendimentoDb(), { id, shortcut: text(body.shortcut, 40), title: text(body.title, 80), body: text(body.body, 2000) });
  return json({ quickReply });
});

export const DELETE = withStaff(async (_staff, _request, context: Context) => {
  const { id } = await context.params;
  deleteQuickReply(atendimentoDb(), id);
  return json({ ok: true });
});
