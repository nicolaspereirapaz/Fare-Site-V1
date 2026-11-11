import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NfseEmissor } from "@/components/staff/NfseEmissor";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { ambiente } from "@/lib/nfse/sefin";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/quoteEditor.css";
import "@/components/staff/nfse.css";

export const metadata: Metadata = { title: "Emissor de NFS-e" };
export const dynamic = "force-dynamic";

export default async function NfsePage() {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const amb = ambiente();
  return (
    <>
      <StaffTopbar current="nfse" name={session.user.name} role={session.user.role} />
      <main className="qe-page">
        <h1 className="qe-title">Emissor de NFS-e</h1>
        <p className="nf-ambiente" data-amb={amb}>{amb === 1 ? "Produção: notas fiscais de verdade" : "Ambiente de teste: notas sem valor fiscal"}</p>
        <NfseEmissor ambiente={amb} />
      </main>
    </>
  );
}
