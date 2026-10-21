"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerEdit } from "@/components/staff/CustomerEdit";
import type { Customer } from "@/components/staff/quoteEditorShared";

/** Dados do cliente na página dele: mostra e, com "Editar", abre o formulário. */
export function CustomerEditPanel({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  if (editing) return <CustomerEdit customerRef={customer.ref} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} />;
  return (
    <div className="qe-client">
      <div>
        <b>{customer.name}{customer.company ? ` · ${customer.company}` : ""}</b>
        <small>{[customer.phone, customer.email, customer.document].filter(Boolean).join(" · ") || "Sem contato"}</small>
      </div>
      <button className="qe-btn-text" onClick={() => setEditing(true)} type="button">Editar</button>
    </div>
  );
}
