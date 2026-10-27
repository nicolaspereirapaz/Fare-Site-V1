"use client";

import { useState } from "react";
import { formatCep } from "@/lib/account/documents";
import { lookupCep } from "@/lib/account/profileClient";
import type { DeliveryAddress } from "@/lib/customers/address";
import "@/components/staff/quoteEditor.css";

/** Endereço de entrega no cadastro do cliente: o CEP preenche rua, bairro, cidade e UF (ViaCEP). */
export function AddressFields({ value, onChange, hint }: { value: DeliveryAddress; onChange: (update: (current: DeliveryAddress) => DeliveryAddress) => void; hint?: string }) {
  const [cepState, setCepState] = useState<"idle" | "loading" | "notfound">("idle");
  const set = (key: keyof DeliveryAddress) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = key === "state" ? event.target.value.toUpperCase() : event.target.value;
    onChange((current) => ({ ...current, [key]: text }));
  };

  async function changeCep(raw: string) {
    const cep = formatCep(raw);
    onChange((current) => ({ ...current, cep }));
    setCepState("idle");
    if (cep.length !== 9) return;
    setCepState("loading");
    const found = await lookupCep(cep);
    if (!found) return setCepState("notfound");
    setCepState("idle");
    // CEP geral da cidade vem sem rua/bairro: não apaga o que já foi digitado.
    onChange((current) => (current.cep === cep ? { ...current, ...Object.fromEntries(Object.entries(found).filter(([, text]) => text)) } : current));
  }

  return (
    <fieldset className="qe-address">
      <legend>Endereço de entrega (opcional)</legend>
      {hint ? <p className="qe-fhint qe-addr-wide">{hint}</p> : null}
      <label className="qe-field">
        <span>CEP</span>
        <input autoComplete="postal-code" inputMode="numeric" onChange={(event) => void changeCep(event.target.value)} placeholder="00000-000" value={value.cep} />
        {cepState === "loading" ? <small className="qe-fhint">Buscando endereço…</small> : null}
        {cepState === "notfound" ? <small className="qe-fhint">CEP não encontrado; preencha abaixo.</small> : null}
      </label>
      <label className="qe-field qe-addr-street"><span>Rua</span><input onChange={set("street")} value={value.street} /></label>
      <label className="qe-field"><span>Número</span><input onChange={set("number")} value={value.number} /></label>
      <label className="qe-field"><span>Complemento</span><input onChange={set("complement")} placeholder="Apto, bloco, sala" value={value.complement} /></label>
      <label className="qe-field"><span>Bairro</span><input onChange={set("district")} value={value.district} /></label>
      <label className="qe-field"><span>Cidade</span><input onChange={set("city")} value={value.city} /></label>
      <label className="qe-field"><span>UF</span><input maxLength={2} onChange={set("state")} value={value.state} /></label>
      <label className="qe-field qe-addr-wide"><span>Ponto de referência</span><input onChange={set("reference")} placeholder="Ex.: portão azul, ao lado da padaria" value={value.reference} /></label>
    </fieldset>
  );
}
