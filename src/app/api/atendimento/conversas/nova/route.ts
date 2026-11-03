import { atendimentoDb, json, readJson, text, withStaff } from "@/lib/atendimento/server";
import { startWhatsAppConversation } from "@/lib/atendimento/whatsapp";

export const dynamic = "force-dynamic";

/** Nova conversa: chama um número pelo WhatsApp da loja (a conversa já abre com quem chamou). */
export const POST = withStaff(async (staff, request) => {
  const body = await readJson(request);
  const conversation = await startWhatsAppConversation(atendimentoDb(), staff, { phone: text(body.phone, 40), name: text(body.name, 80) });
  return json({ conversation }, 201);
});
