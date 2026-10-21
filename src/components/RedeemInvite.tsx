"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Botão "Ativar" do convite profissional para quem já está logado. */
export function RedeemInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function redeem() {
    setBusy(true); setError("");
    const response = await fetch("/api/account/convite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (response.ok) { router.push("/produtos/revelacao-de-fotos"); router.refresh(); return; }
    const data = await response.json().catch(() => ({})) as { message?: string };
    setError(data.message ?? "Não foi possível ativar. Fale com a Fare Foto.");
    setBusy(false);
  }
  return (
    <>
      <button className="button button-primary button-large" disabled={busy} onClick={redeem} type="button">{busy ? "Ativando…" : "Ativar tabela profissional"}</button>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </>
  );
}
