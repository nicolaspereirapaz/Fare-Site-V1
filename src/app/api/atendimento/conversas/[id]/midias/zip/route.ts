import { AtendimentoError, getConversation, listContactMedia } from "@/lib/atendimento/repository";
import { existsSync } from "node:fs";
import { mediaPath, mediaRetentionDays, zipStream } from "@/lib/atendimento/media";
import { atendimentoDb, withStaff } from "@/lib/atendimento/server";
import { mediaZipPlan } from "@/lib/atendimento/mediaZip";
import { parseNumberList } from "@/lib/atendimento/numberList";

export const dynamic = "force-dynamic";

/**
 * Baixa as mídias do contato num ZIP: ?nums=1-5,8 (números da lista de mídias; sem nums = todas),
 * ?tipo=fotos (só fotos) ou todas; ?quem=cliente (só o que o cliente mandou).
 */
export const GET = withStaff(async (_staff, request, context: RouteContext<"/api/atendimento/conversas/[id]/midias/zip">) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const conversation = getConversation(db, id);
  const params = new URL(request.url).searchParams;
  const all = listContactMedia(db, id);
  const nums = params.get("nums")?.trim();
  const plan = mediaZipPlan(all, conversation, {
    numbers: nums ? parseNumberList(nums.slice(0, 2000), all.length) : null,
    onlyPhotos: params.get("tipo") === "fotos",
    onlyCustomer: params.get("quem") === "cliente",
  });
  if (!plan.entries.length) throw new AtendimentoError("INVALID_REQUEST", "Nenhuma mídia nesse intervalo.");
  // Originais apagados pela limpeza (mais de N dias) ficam fora do ZIP.
  const entries = plan.entries.map((entry) => ({ ...entry, file: mediaPath(entry.file) })).filter((entry) => existsSync(entry.file));
  if (!entries.length) throw new AtendimentoError("INVALID_REQUEST", `Os originais desse intervalo já foram apagados (guardamos ${mediaRetentionDays()} dias).`);
  return new Response(zipStream(entries), {
    headers: {
      "content-type": "application/zip",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(plan.zipName)}`,
    },
  });
});
