"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { CustomerPicker } from "@/components/staff/QuoteEditor";

/** "Novo cliente" na página Clientes: mesmo cadastro do editor (avisa se já existe) e abre a ficha criada. */
export function NewCustomerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) return <button className="kb-new-quote" onClick={() => setOpen(true)} type="button"><Plus aria-hidden="true" size={16} /> Novo cliente</button>;
  return (
    <div className="qe-card cl-new">
      <h2>Novo cliente</h2>
      <CustomerPicker onCancel={() => setOpen(false)} onPick={(customer) => router.push(`/equipe/clientes/${encodeURIComponent(customer.ref)}`)} startCreating />
    </div>
  );
}
