import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PickupActions } from "@/components/staff/PickupActions";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { database } from "@/lib/auth";
import { avisoLabel } from "@/lib/backoffice/finishedOrders";
import { ORDER_STAFF_LABELS } from "@/lib/backoffice/orderStatus";
import { matchesSearch } from "@/lib/backoffice/search";
import { formatDeliveryAddress } from "@/lib/customers/address";
import { documentNumberOf } from "@/lib/documentNumber";
import { orderCode } from "@/lib/orders/orderCode";
import { getOrderFinance } from "@/lib/orders/payments";
import { paymentPlan } from "@/lib/orders/paymentPlan";
import { getPickupNotice } from "@/lib/orders/pickupNotice";
import { listAllOrders, listOrderStatusHistory, type Order } from "@/lib/orders/repository";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/quoteEditor.css";
import "@/components/staff/customers.css";
import "@/components/staff/retirada.css";

export const metadata: Metadata = { title: "Retirada" };
export const dynamic = "force-dynamic";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às");

/** Busca: número, nome ou empresa. Número exato e pedidos prontos primeiro; cancelados ficam de fora. */
function search(q: string): Order[] {
  const number = /^\D*0*(\d+)$/.exec(q.trim())?.[1];
  const rank = (order: Order) => (number && String(documentNumberOf(order.id)) === number ? 0 : 2) + (order.status === "aguardando_retirada" ? 0 : 1);
  return listAllOrders(database)
    .filter((order) => order.status !== "cancelado")
    .filter((order) => matchesSearch({ code: orderCode(order.id), customerName: order.customer.name, customerCompany: order.customer.company, items: order.items }, q))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 20);
}

function stateText(order: Order, history: ReturnType<typeof listOrderStatusHistory>) {
  if (order.status === "concluido") {
    const at = [...history].reverse().find((entry) => entry.nextStatus === "concluido")?.createdAt;
    return `Já entregue${at ? ` em ${when(at)}` : ""}.`;
  }
  if (order.status === "aguardando_pagamento") return "Aguardando o pagamento: ainda não entrou em produção.";
  return `Ainda não está pronto (${ORDER_STAFF_LABELS[order.status]}).`;
}

export default async function PickupPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  const orders = q ? search(q) : [];
  const now = new Date();
  return (
    <>
      <StaffTopbar name={session.user.name} role={session.user.role} current="retirada" />
      <main className="qe-page cl-page rt-page">
        <h1 className="qe-title">Retirada</h1>
        <form className="cl-search" role="search">
          <input aria-label="Buscar pedido" autoFocus defaultValue={q} name="q" placeholder="Número do pedido, nome ou empresa" />
          <button className="kb-secondary" type="submit">Buscar</button>
        </form>
        {q ? <p className="cl-count">{orders.length ? `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"} para "${q}"` : `Nenhum pedido para "${q}".`}</p> : null}
        <div className="rt-list">
          {orders.map((order) => {
            const finance = getOrderFinance(database, order.id);
            const history = listOrderStatusHistory(database, order.id);
            const ready = order.status === "aguardando_retirada";
            const plan = finance ? paymentPlan(finance) : null;
            const delivery = finance?.deliveryMode === "entrega";
            const address = delivery ? formatDeliveryAddress(finance?.deliveryAddress) || order.customer.address || "Endereço não informado" : "";
            const total = order.totalCents ?? Math.round(order.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100);
            return (
              <article className={`qe-card rt-card${ready ? " is-ready" : ""}`} key={order.id}>
                <header className="rt-head">
                  <h2>{orderCode(order.id)}</h2>
                  <span className={`rt-status rt-status-${order.status}`}>{ready ? (delivery ? "Pronto para entrega" : "Pronto para retirar") : ORDER_STAFF_LABELS[order.status]}</span>
                </header>
                <p className="rt-customer">
                  <b>{order.customer.company || order.customer.name}</b>
                  <span>{[order.customer.company ? order.customer.name : "", order.customer.phone || "Sem telefone"].filter(Boolean).join(" · ")}</span>
                </p>
                <ul className="rt-items">
                  {order.items.map((item, index) => {
                    const variation = Object.values(item.selections).filter(Boolean).join(" · ");
                    return <li key={index}>{item.quantity} × {item.productName}{variation ? <small> · {variation}</small> : null}</li>;
                  })}
                </ul>
                <p className="rt-line">{delivery ? <>Entrega: {address}</> : "Retirada na loja"}</p>
                {order.customer.notes ? <p className="rt-line">Obs.: {order.customer.notes}</p> : null}
                {finance?.internalNotes ? <p className="rt-line">Obs. interna: {finance.internalNotes}</p> : null}
                <dl className="rt-money">
                  <div><dt>Total</dt><dd>{brl(total)}</dd></div>
                  {plan?.receipts.map((receipt, index) => <div key={index}><dt>{receipt.label}</dt><dd>{receipt.amount}</dd></div>)}
                  {plan?.remainder ? <div className="rt-due"><dt>{plan.remainder.label}</dt><dd>{plan.remainder.amount}</dd></div> : finance ? <div><dt>Situação</dt><dd>Quitado</dd></div> : null}
                </dl>
                {ready ? <p className="rt-notice">{avisoLabel(getPickupNotice(database, order.id), history.map((entry) => ({ status: entry.nextStatus, at: entry.createdAt })), now)}</p> : <p className="rt-notice">{stateText(order, history)}</p>}
                {ready ? <PickupActions finance={finance} orderId={order.id} paymentMethod={order.paymentMethod} status={order.status} /> : null}
                <Link className="rt-open" href={`/equipe/pedidos/${order.id}`}>Abrir pedido</Link>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
