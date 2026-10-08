"use client";

import Link from "next/link";
import { ReceiptText } from "lucide-react";
import type { AccountProfileData } from "@/lib/account/profile";
import { formatBillingAddress } from "@/lib/commerce";

/** Mostra no carrinho para quem o pedido será faturado (vem do cadastro da conta). */
export function BillingSummary({ profile }: { profile: AccountProfileData }) {
  const pj = profile.personType === "pj";

  return (
    <section aria-labelledby="billing-summary-title" className="billing-summary">
      <div className="billing-summary-head">
        <ReceiptText aria-hidden="true" size={18} />
        <h3 id="billing-summary-title">Faturar para</h3>
        {profile.complete ? <Link href="/minha-conta/dados">Alterar</Link> : null}
      </div>

      {profile.complete ? (
        <div className="billing-summary-body">
          <strong>{pj ? profile.companyName : profile.name}</strong>
          <span>{pj ? `CNPJ ${profile.document}` : `CPF ${profile.document}`}{pj ? ` · IE ${profile.stateRegistration}` : ""}</span>
          <span>{formatBillingAddress(profile.address)}</span>
        </div>
      ) : (
        <div className="billing-summary-body">
          <span>Complete seu cadastro com CPF ou CNPJ e endereço para a nota fiscal ir junto com o pedido.</span>
          <Link className="billing-summary-cta" href="/minha-conta/dados">Completar cadastro →</Link>
          <small>Se preferir, envie o pedido assim mesmo e passe os dados pelo WhatsApp.</small>
        </div>
      )}
    </section>
  );
}
