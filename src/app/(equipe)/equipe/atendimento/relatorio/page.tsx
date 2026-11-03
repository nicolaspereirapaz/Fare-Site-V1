import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportApp } from "@/components/staff/atendimento/ReportApp";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { getStaffSession } from "@/lib/staff/server";

export const metadata: Metadata = { title: "Relatório do atendimento" };
export const dynamic = "force-dynamic";

export default async function RelatorioPage() {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  return (
    <>
      <StaffTopbar current="atendimento" name={session.user.name} role={session.user.role} />
      <ReportApp />
    </>
  );
}
