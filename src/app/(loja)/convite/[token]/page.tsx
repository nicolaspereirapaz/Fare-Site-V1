import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { RedeemInvite } from "@/components/RedeemInvite";
import { database } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth/server";
import { inviteState, isProfessional } from "@/lib/professional";

export const metadata: Metadata = { title: "Convite profissional", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PROBLEMS = {
  usado: "Este convite já foi usado.",
  vencido: "Este convite venceu.",
  inexistente: "Convite não encontrado.",
} as const;

/** Link do convite da equipe: cria a conta (ou entra) e liga a tabela de Revelação Profissional. */
export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ entrar?: string }> }) {
  const { token } = await params;
  const { entrar } = await searchParams;
  const session = await getCurrentSession();
  const state = inviteState(database, token);

  if (session && isProfessional(database, session.user.id)) {
    return (
      <section className="auth-page container-shell"><div className="auth-card">
        <span className="eyebrow">Revelação profissional</span>
        <h1>Sua conta já tem a tabela profissional</h1>
        <p>Os preços profissionais aparecem quando você monta o pedido de fotos.</p>
        <Link className="button button-primary" href="/produtos/revelacao-de-fotos">Enviar fotos</Link>
      </div></section>
    );
  }
  if (state !== "valido") {
    return (
      <section className="auth-page container-shell"><div className="auth-card">
        <span className="eyebrow">Revelação profissional</span>
        <h1>{PROBLEMS[state]}</h1>
        <p>Peça um novo convite à Fare Foto pelo WhatsApp.</p>
      </div></section>
    );
  }
  if (session) {
    return (
      <section className="auth-page container-shell"><div className="auth-card">
        <span className="eyebrow">Revelação profissional</span>
        <h1>Ativar a tabela profissional</h1>
        <p>Na conta <strong>{session.user.email}</strong>. Depois disso, os pedidos de fotos desta conta usam os preços profissionais.</p>
        <RedeemInvite token={token} />
      </div></section>
    );
  }
  return (
    <section className="auth-page container-shell">
      <p className="auth-invite-note"><strong>Convite da Fare Foto:</strong> {entrar ? "entre na sua conta" : "crie sua conta"} para usar a tabela de Revelação Profissional.</p>
      <AuthForm invite={token} mode={entrar ? "sign-in" : "sign-up"} />
    </section>
  );
}
