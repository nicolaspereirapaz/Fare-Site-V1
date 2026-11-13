import { AtendimentoError } from "@/lib/atendimento/repository";
import { atendimentoDb, deliverInBackground, json, readJson, withStaff } from "@/lib/atendimento/server";
import { forwardMessages } from "@/lib/atendimento/service";

export const dynamic = "force-dynamic";

const ids = (value: unknown, max: number) =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 80))].slice(0, max) : [];

/** Encaminhar: as mensagens escolhidas (até 100) vão para até 5 conversas, como no WhatsApp. */
export const POST = withStaff(async (staff, request) => {
  const body = await readJson(request);
  const messageIds = ids(body.messageIds, 100);
  const conversationIds = ids(body.conversationIds, 5);
  if (!messageIds.length || !conversationIds.length) throw new AtendimentoError("INVALID_REQUEST", "Escolha as mensagens e para quem encaminhar.");
  const db = atendimentoDb();
  let sent = 0;
  let skipped = 0;
  for (const conversationId of conversationIds) {
    const result = await forwardMessages(db, conversationId, staff, messageIds);
    deliverInBackground(db, result.sent);
    sent += result.sent.length;
    skipped = result.skipped;
  }
  return json({ sent, skipped }, 201);
});
