import { cleanupAbandonedUploads, saveUpload } from "@/lib/photoOrders/uploads";
import { isCampaignOnlyMode } from "@/lib/siteMode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Recebe uma foto do cliente (o arquivo vai no corpo, o nome no cabeçalho x-file-name), sem limite de tamanho.
 * Converte com ffmpeg o que a máquina não aceita (HEIC, WEBP…) e devolve medidas e o id do envio.
 * Não precisa de conta: o cliente envia enquanto monta o pedido; o login é pedido só ao finalizar.
 */
export async function POST(request: Request) {
  // Esta rota não passa pelo proxy (ver src/proxy.ts), então o bloqueio do modo campanha é feito aqui.
  if (isCampaignOnlyMode()) return Response.json({ error: "Não encontrado." }, { status: 404 });
  if (!request.body) return Response.json({ error: "Arquivo vazio." }, { status: 400 });
  const name = decodeURIComponent(request.headers.get("x-file-name") ?? "foto");
  try {
    const upload = await saveUpload(request.body, name);
    void cleanupAbandonedUploads().catch((error) => console.error("[fotos] limpeza de envios abandonados", error));
    return Response.json({ id: upload.id, width: upload.width, height: upload.height, convertedFrom: upload.convertedFrom });
  } catch (error) {
    console.error("[fotos] envio falhou", error);
    return Response.json({ error: "Não conseguimos ler esta foto. Tente outro arquivo." }, { status: 422 });
  }
}
