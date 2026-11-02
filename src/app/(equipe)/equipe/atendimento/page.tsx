import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AtendimentoApp } from "@/components/staff/atendimento/AtendimentoApp";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { getStaffSession } from "@/lib/staff/server";

export const metadata: Metadata = { title: "Atendimento" };
export const dynamic = "force-dynamic";

export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ visao?: string; conversa?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const params = await searchParams;
  return (
    <>
      <StaffTopbar current="atendimento" name={session.user.name} role={session.user.role} />
      <AtendimentoApp
        initialConversation={typeof params.conversa === "string" ? params.conversa.slice(0, 64) : undefined}
        initialView={params.visao === "quadro" ? "quadro" : "conversas"}
        me={{ id: session.user.id, name: session.user.name, role: session.user.role }}
      />
    </>
  );
}
