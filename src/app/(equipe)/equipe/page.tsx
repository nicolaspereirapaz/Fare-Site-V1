import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeBoard } from "@/components/BackofficeBoard";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { canCancelOrders } from "@/lib/backoffice/access";
import { getStaffSession } from "@/lib/staff/server";

export const metadata: Metadata = { title: "Painel" };

export default async function StaffPanelPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");

  return (
    <>
      <StaffTopbar name={session.user.name} role={session.user.role} />
      <BackofficeBoard canCancel={canCancelOrders(session.user.role)} initialTab={(await searchParams).aba === "orcamentos" ? "orcamentos" : "pedidos"} />
    </>
  );
}
