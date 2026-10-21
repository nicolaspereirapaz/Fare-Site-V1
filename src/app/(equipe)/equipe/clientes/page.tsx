import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { database } from "@/lib/auth";
import { listCustomers } from "@/lib/customers/repository";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/customers.css";

export const metadata: Metadata = { title: "Clientes cadastrados" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.slice(0, 80) : "";
  const customers = listCustomers(database, q);
  return (
    <>
      <StaffTopbar name={session.user.name} role={session.user.role} />
      <main className="container-shell cl-page">
        <h1>Clientes cadastrados</h1>
        <form className="cl-search" role="search">
          <input aria-label="Buscar cliente" defaultValue={q} name="q" placeholder="Nome, empresa, WhatsApp, e-mail ou CPF/CNPJ" />
          <button className="kb-secondary" type="submit">Buscar</button>
        </form>
        <p className="cl-count">{customers.length} {customers.length === 1 ? "cliente" : "clientes"}{q ? ` para "${q}"` : ""}</p>
        <ul className="cl-list">
          {customers.map((customer) => (
            <li key={customer.ref}>
              <Link href={`/equipe/clientes/${encodeURIComponent(customer.ref)}`}>
                <b>{customer.name}{customer.company ? ` · ${customer.company}` : ""}</b>
                <small>{[customer.phone, customer.email, customer.document].filter(Boolean).join(" · ") || "Sem contato"}</small>
                <span className="cl-kind">{customer.kind === "conta" ? "Conta no site" : `Cadastrado por ${customer.createdBy ?? "equipe"}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
