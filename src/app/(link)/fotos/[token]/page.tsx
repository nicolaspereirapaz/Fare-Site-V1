import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoLinkPage } from "@/components/fotos/PhotoLinkPage";
import { database } from "@/lib/auth";
import { photoLinkStaffUrl, photoLinkView } from "@/lib/photoLinks/links";
import { getStaffSession } from "@/lib/staff/server";

export const metadata: Metadata = { title: "Enviar fotos" };
export const dynamic = "force-dynamic";

/**
 * Link das fotos que a equipe manda ao cliente (orçamento ou pedido). O endereço secreto é a autorização.
 * `?editar=1` (botão "Editar fotos" da equipe): abre direto as fotos já enviadas no editor.
 */
export default async function FotosLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const view = photoLinkView(database, token);
  if (!view) notFound();
  // Equipe logada: modo equipe (Duplicar, "Salvar fotos no pedido" e o caminho para o pedido). O cliente não vê.
  const staffUrl = (await getStaffSession()) ? photoLinkStaffUrl(database, token) : null;
  return <PhotoLinkPage autoEdit={(await searchParams).editar === "1"} staffUrl={staffUrl} token={token} view={view} />;
}
