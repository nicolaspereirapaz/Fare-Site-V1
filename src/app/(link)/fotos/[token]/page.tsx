import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoLinkPage } from "@/components/fotos/PhotoLinkPage";
import { database } from "@/lib/auth";
import { photoLinkView } from "@/lib/photoLinks/links";

export const metadata: Metadata = { title: "Enviar fotos" };
export const dynamic = "force-dynamic";

/** Link das fotos que a equipe manda ao cliente (orçamento ou pedido). O endereço secreto é a autorização. */
export default async function FotosLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = photoLinkView(database, token);
  if (!view) notFound();
  return <PhotoLinkPage token={token} view={view} />;
}
