"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerEdit } from "@/components/staff/CustomerEdit";
import type { Customer } from "@/components/staff/quoteEditorShared";

/** Dados do cliente na página dele: mostra e, com "Editar", abre o formulário. Cadastro da equipe também pode ser excluído. */
export function CustomerEditPanel({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    const response = await fetch(`/api/backoffice/orcamento-editor/clientes?ref=${encodeURIComponent(customer.ref)}`, { method: "DELETE" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { message?: string } | null;
    setDeleting(false);
    if (!response?.ok) return setError(body?.message ?? "Não foi possível excluir. Tente de novo.");
    router.push("/equipe/clientes");
    router.refresh();
  }

  if (editing) return <CustomerEdit customerRef={customer.ref} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} />;
  return (
    <>
      <div className="qe-client">
        <div>
          <b>{customer.name}{customer.company ? ` · ${customer.company}` : ""}</b>
          <small>{[customer.phone, customer.email, customer.document].filter(Boolean).join(" · ") || "Sem contato"}</small>
        </div>
        <button className="qe-btn-text" onClick={() => setEditing(true)} type="button">Editar</button>
        {customer.kind === "painel" && !confirming ? <button className="qe-btn-text cl-delete" onClick={() => setConfirming(true)} type="button">Excluir</button> : null}
      </div>
      {confirming ? (
        <div className="cl-confirm" role="alert">
          <span>Excluir {customer.name} de vez? Não dá para desfazer.</span>
          <button className="qe-btn-text cl-delete" disabled={deleting} onClick={() => void remove()} type="button">{deleting ? "Excluindo…" : "Sim, excluir"}</button>
          <button className="qe-btn-text" disabled={deleting} onClick={() => { setConfirming(false); setError(null); }} type="button">Cancelar</button>
        </div>
      ) : null}
      {error ? <p className="qe-warn">{error}</p> : null}
    </>
  );
}
