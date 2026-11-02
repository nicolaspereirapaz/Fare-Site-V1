import { atendimentoDb, json, readJson, text, withStaff } from "@/lib/atendimento/server";
import { sendStaffMessage } from "@/lib/atendimento/service";
import { getConversation } from "@/lib/atendimento/repository";

export const dynamic = "force-dynamic";

/** Vendedor envia mensagem (sign: assina com o primeiro nome). No simulador o "envio" é só gravar; no WhatsApp, a etapa seguinte. */
export const POST = withStaff(async (staff, request, context: RouteContext<"/api/atendimento/conversas/[id]/mensagens">) => {
  const { id } = await context.params;
  const body = await readJson(request);
  const db = atendimentoDb();
  const message = sendStaffMessage(db, id, staff, text(body.text), { sign: body.sign !== false });
  return json({ message, conversation: getConversation(db, id) }, 201);
});
