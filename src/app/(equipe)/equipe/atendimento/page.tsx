import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AtendimentoApp } from "@/components/staff/atendimento/AtendimentoApp";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { conversationForPhone } from "@/lib/atendimento/repository";
import { atendimentoDb } from "@/lib/atendimento/server";
import { getStaffSession } from "@/lib/staff/server";

export const metadata: Metadata = { title: "Atendimento" };
export const dynamic = "force-dynamic";

export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ visao?: string; conversa?: string; telefone?: string; nome?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const params = await searchParams;
  // Vindo do pedido ou do cadastro (?telefone=): abre a conversa desse número; sem conversa, abre "Nova conversa" já preenchida.
  const phone = typeof params.telefone === "string" ? params.telefone.slice(0, 40) : "";
  const byPhone = phone ? conversationForPhone(atendimentoDb(), phone) : null;
  return (
    <>
      <StaffTopbar current="atendimento" name={session.user.name} role={session.user.role} />
      <AtendimentoApp
        initialContact={phone && !byPhone ? { phone, name: typeof params.nome === "string" ? params.nome.slice(0, 80) : "" } : undefined}
        initialConversation={byPhone?.id ?? (typeof params.conversa === "string" ? params.conversa.slice(0, 64) : undefined)}
        initialView={params.visao === "quadro" ? "quadro" : "conversas"}
        me={{ id: session.user.id, name: session.user.name, role: session.user.role }}
      />
    </>
  );
}
