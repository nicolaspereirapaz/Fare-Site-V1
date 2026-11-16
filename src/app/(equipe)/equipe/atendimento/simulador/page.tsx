import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SimuladorApp } from "@/components/staff/atendimento/SimuladorApp";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { getStaffSession } from "@/lib/staff/server";

export const metadata: Metadata = { title: "Simulador de cliente" };
export const dynamic = "force-dynamic";

/** Teste do atendimento sem WhatsApp: só para a equipe logada. */
export default async function SimuladorPage() {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  return (
    <>
      <StaffTopbar current="atendimento" name={session.user.name} role={session.user.role} />
      <SimuladorApp />
    </>
  );
}
