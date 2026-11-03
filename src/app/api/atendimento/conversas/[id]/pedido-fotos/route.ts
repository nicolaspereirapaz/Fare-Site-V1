import { atendimentoDb, json, readJson, withStaff } from "@/lib/atendimento/server";
import { createChatPhotoOrder, parseChatPhotoOrder } from "@/lib/atendimento/photoOrder";

export const dynamic = "force-dynamic";

/** Cria o pedido de revelação com fotos escolhidas da conversa (vai para o quadro de Pedidos e para a pasta do dia). */
export const POST = withStaff(async (staff, request, context: RouteContext<"/api/atendimento/conversas/[id]/pedido-fotos">) => {
  const { id } = await context.params;
  const input = parseChatPhotoOrder(await readJson(request));
  return json(await createChatPhotoOrder(atendimentoDb(), id, staff, input), 201);
});
