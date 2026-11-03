import { listContactMedia } from "@/lib/atendimento/repository";
import { atendimentoDb, json, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Todas as mídias do contato, numeradas na ordem em que chegaram (nº 1 = a mais antiga). */
export const GET = withStaff(async (_staff, _request, context: RouteContext<"/api/atendimento/conversas/[id]/midias">) => {
  const { id } = await context.params;
  const media = listContactMedia(atendimentoDb(), id).map((message, index) => ({
    number: index + 1,
    id: message.id,
    author: message.author,
    authorName: message.authorName,
    caption: message.body,
    createdAt: message.createdAt,
    media: message.media,
  }));
  return json({ media });
});
