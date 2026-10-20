import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeBoard } from "@/components/BackofficeBoard";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { canCancelOrders } from "@/lib/backoffice/access";
import { getStaffSession } from "@/lib/staff/server";

export const metadata: Metadata = { title: "Painel" };

export default async function StaffPanelPage({ searchParams }: { searchParams: Promise<{ aba?: string; novo?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");

  const params = await searchParams;
  return (
    <>
      <StaffTopbar name={session.user.name} role={session.user.role} />
      <BackofficeBoard
        key={`${params.aba ?? "pedidos"}:${params.novo ?? ""}`}
        canCancel={canCancelOrders(session.user.role)}
        freshQuoteId={typeof params.novo === "string" ? params.novo.slice(0, 64) : undefined}
        initialTab={params.aba === "orcamentos" ? "orcamentos" : "pedidos"}
      />
    </>
  );
}
