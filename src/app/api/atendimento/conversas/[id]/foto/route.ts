import { contactPhoto } from "@/lib/atendimento/avatar";
import { atendimentoDb, json, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Foto de perfil do WhatsApp do contato (404 = sem foto; o painel mostra as iniciais). */
export const GET = withStaff(async (_staff, _request, context: RouteContext<"/api/atendimento/conversas/[id]/foto">) => {
  const { id } = await context.params;
  const photo = await contactPhoto(atendimentoDb(), id);
  if (!photo) return json({ error: "SEM_FOTO" }, 404);
  return new Response(new Uint8Array(photo), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
});
