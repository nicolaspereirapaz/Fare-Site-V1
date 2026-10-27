import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PhotoOrderFiles } from "@/components/staff/fotos/PhotoOrderFiles";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { database } from "@/lib/auth";
import { getPhotoOrder } from "@/lib/photoOrders/repository";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/quoteEditor.css";

export const metadata: Metadata = { title: "Pedido de fotos" };
export const dynamic = "force-dynamic";

/** Pedido de fotos: as fotos ficam na página do pedido; aqui só sobra quem não virou pedido. */
export default async function PhotoOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const order = getPhotoOrder(database, (await params).id);
  if (!order) notFound();
  if (order.orderId) redirect(`/equipe/pedidos/${order.orderId}#fotos`);
  return (
    <>
      <StaffTopbar name={session.user.name} role={session.user.role} current="quadro" />
      <main className="qe-page">
        <div className="qe-crumb"><Link href="/equipe?aba=pedidos"><ArrowLeft aria-hidden="true" size={13} /> Pedidos</Link></div>
        <h1 className="qe-title">{order.code} · {order.customer.name}</h1>
        <PhotoOrderFiles order={order} />
      </main>
    </>
  );
}
