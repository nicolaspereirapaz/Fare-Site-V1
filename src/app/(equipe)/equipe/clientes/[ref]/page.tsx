import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CustomerEditPanel } from "@/components/staff/CustomerEditPanel";
import { ProfessionalToggle } from "@/components/staff/ProfessionalControls";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { database } from "@/lib/auth";
import { customerHistory, resolveCustomer } from "@/lib/customers/repository";
import { ORDER_STATUS_LABELS } from "@/lib/orders/labels";
import { orderCode } from "@/lib/orders/orderCode";
import { QUOTE_STATUS_LABELS, quoteCode } from "@/lib/quotes/quoteCode";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/quoteEditor.css";
import "@/components/staff/customers.css";

export const metadata: Metadata = { title: "Cliente" };
export const dynamic = "force-dynamic";

const brl = (cents: number | null) => (cents === null ? "Sob consulta" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const day = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
const quoteLabels = QUOTE_STATUS_LABELS as Record<string, string>;
const orderLabels = ORDER_STATUS_LABELS as Record<string, string>;

/** Cliente: dados (com "Editar") e todo o histórico de orçamentos e pedidos. */
export default async function CustomerPage({ params }: { params: Promise<{ ref: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const ref = decodeURIComponent((await params).ref);
  const customer = resolveCustomer(database, ref);
  if (!customer) notFound();
  const history = customerHistory(database, ref);
  const orders = history.filter((entry) => entry.kind === "order" && entry.status !== "cancelado");
  const ordersTotal = orders.reduce((sum, entry) => sum + (entry.totalCents ?? 0), 0);
  return (
    <>
      <StaffTopbar name={session.user.name} role={session.user.role} />
      <main className="container-shell cl-page">
        <p><Link href="/equipe/clientes">← Clientes cadastrados</Link></p>
        <h1>{customer.name}</h1>
        <p className="cl-count">
          {customer.kind === "conta" ? "Conta no site" : `Cadastrado por ${customer.createdBy ?? "equipe"}`} · {orders.length} {orders.length === 1 ? "pedido" : "pedidos"} · {brl(ordersTotal)} em pedidos
        </p>
        <section className="qe-card">
          <h2>Dados do cliente</h2>
          <CustomerEditPanel customer={customer} />
          {customer.kind === "conta" ? <ProfessionalToggle customerRef={customer.ref} professional={Boolean(customer.professional)} />
            : <p className="cl-count">Tabela profissional: só para quem tem conta no site (mande o convite em Clientes cadastrados).</p>}
        </section>
        <section className="qe-card">
          <h2>Orçamentos e pedidos</h2>
          {history.length ? (
            <table className="cl-history">
              <thead><tr><th>Número</th><th>Data</th><th>Situação</th><th>Valor</th></tr></thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td><Link href={entry.kind === "quote" ? `/equipe/orcamentos/${entry.id}/consulta` : `/equipe/pedidos/${entry.id}`}>{entry.kind === "quote" ? quoteCode(entry.id) : orderCode(entry.id)}</Link></td>
                    <td>{day(entry.createdAt)}</td>
                    <td>{(entry.kind === "quote" ? quoteLabels : orderLabels)[entry.status] ?? entry.status}</td>
                    <td>{brl(entry.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="cl-count">Nenhum orçamento ou pedido ainda.</p>}
        </section>
      </main>
    </>
  );
}
