import { AtendimentoError, getConversation, listContactMedia } from "@/lib/atendimento/repository";
import { mediaPath, zipStream } from "@/lib/atendimento/media";
import { atendimentoDb, withStaff } from "@/lib/atendimento/server";
import { mediaZipPlan } from "@/lib/atendimento/mediaZip";

export const dynamic = "force-dynamic";

/**
 * Baixa as mídias do contato num ZIP: ?de=N&ate=M (números da lista de mídias),
 * ?tipo=fotos (só fotos) ou todas; ?quem=cliente (só o que o cliente mandou).
 */
export const GET = withStaff(async (_staff, request, context: RouteContext<"/api/atendimento/conversas/[id]/midias/zip">) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const conversation = getConversation(db, id);
  const params = new URL(request.url).searchParams;
  const plan = mediaZipPlan(listContactMedia(db, id), conversation, {
    from: Number(params.get("de")) || 1,
    to: Number(params.get("ate")) || Number.MAX_SAFE_INTEGER,
    onlyPhotos: params.get("tipo") === "fotos",
    onlyCustomer: params.get("quem") === "cliente",
  });
  if (!plan.entries.length) throw new AtendimentoError("INVALID_REQUEST", "Nenhuma mídia nesse intervalo.");
  const entries = plan.entries.map((entry) => ({ ...entry, file: mediaPath(entry.file) }));
  return new Response(zipStream(entries), {
    headers: {
      "content-type": "application/zip",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(plan.zipName)}`,
    },
  });
});
