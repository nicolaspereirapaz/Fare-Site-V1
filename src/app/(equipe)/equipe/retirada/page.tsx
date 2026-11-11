import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MessageCircle, Package, Search, StickyNote, Store, Truck } from "lucide-react";
import { PickupActions } from "@/components/staff/PickupActions";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { database } from "@/lib/auth";
import { avisoLabel, finalizadoEm } from "@/lib/backoffice/finishedOrders";
import { ORDER_STAFF_LABELS } from "@/lib/backoffice/orderStatus";
import { matchesSearch } from "@/lib/backoffice/search";
import { formatDeliveryAddress } from "@/lib/customers/address";
import { documentNumberOf } from "@/lib/documentNumber";
import { orderCode } from "@/lib/orders/orderCode";
import { getOrderFinance } from "@/lib/orders/payments";
import { paymentPlan } from "@/lib/orders/paymentPlan";
import { getPickupNotice } from "@/lib/orders/pickupNotice";
import { listAllOrders, listOrderStatusHistory, type Order } from "@/lib/orders/repository";
import { documentImageOf } from "@/lib/proposals/catalogImages";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/quoteEditor.css";
import "@/components/staff/retirada.css";

export const metadata: Metadata = { title: "Retirada" };
export const dynamic = "force-dynamic";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às");

type Entry = { status: Order["status"]; at: string };
const historyOf = (order: Order): Entry[] => listOrderStatusHistory(database, order.id).map((entry) => ({ status: entry.nextStatus, at: entry.createdAt }));

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

/** Sem busca: todos os pedidos prontos esperando o cliente, os que ficaram prontos por último primeiro. */
function readyOrders(): Order[] {
  const readyAt = (order: Order) => finalizadoEm(historyOf(order)) ?? order.updatedAt;
  return listAllOrders(database)
    .filter((order) => order.status === "aguardando_retirada")
    .map((order) => ({ order, at: readyAt(order) }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60)
    .map(({ order }) => order);
}

function stateText(order: Order, history: Entry[]) {
  if (order.status === "concluido") {
    const at = [...history].reverse().find((entry) => entry.status === "concluido")?.at;
    return `Já entregue${at ? ` em ${when(at)}` : ""}.`;
  }
  if (order.status === "aguardando_pagamento") return "Aguardando o pagamento: ainda não entrou em produção.";
  return `Ainda não está pronto (${ORDER_STAFF_LABELS[order.status]}).`;
}

async function PickupCard({ order, now }: { order: Order; now: Date }) {
  const finance = getOrderFinance(database, order.id);
  const history = historyOf(order);
  const images = await Promise.all(order.items.map((item) => documentImageOf(item).catch(() => null)));
  const ready = order.status === "aguardando_retirada";
  const readyAt = ready ? finalizadoEm(history) : null;
  const plan = finance ? paymentPlan(finance) : null;
  const delivery = finance?.deliveryMode === "entrega";
  const address = delivery ? formatDeliveryAddress(finance?.deliveryAddress) || order.customer.address || "Endereço não informado" : "";
  const total = order.totalCents ?? Math.round(order.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100);
  const notice = ready ? getPickupNotice(database, order.id) : null;
  return (
    <article className={`rt-card${ready ? " is-ready" : ""}`}>
      <header className="rt-card-head">
        <div>
          <span className="rt-code">{orderCode(order.id)}</span>
          {readyAt ? <small>Pronto em {when(readyAt)}</small> : null}
        </div>
        <span className={`rt-status rt-status-${order.status}`}>{ready ? (delivery ? "Pronto para entrega" : "Pronto para retirar") : ORDER_STAFF_LABELS[order.status]}</span>
      </header>

      <div className="rt-who">
        <b>{order.customer.company || order.customer.name}</b>
        <span>{[order.customer.company ? order.customer.name : "", order.customer.phone || "Sem telefone"].filter(Boolean).join(" · ")}</span>
      </div>

      <ul className="rt-items">
        {order.items.map((item, index) => {
          const variation = Object.values(item.selections).filter(Boolean).join(" · ");
          return (
            <li key={index}>
              <span className="rt-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {images[index] ? <img alt="" loading="lazy" src={images[index]} /> : <Package aria-hidden="true" size={22} />}
              </span>
              <span className="rt-item-text">
                <b>{item.quantity} × {item.productName}</b>
                {variation ? <small>{variation}</small> : null}
              </span>
            </li>
          );
        })}
      </ul>

      <ul className="rt-facts">
        <li>{delivery ? <Truck aria-hidden="true" size={16} /> : <Store aria-hidden="true" size={16} />}<span>{delivery ? <>Entrega: {address}</> : "Retirada na loja"}</span></li>
        {order.customer.notes ? <li><StickyNote aria-hidden="true" size={16} /><span>{order.customer.notes}</span></li> : null}
        {finance?.internalNotes ? <li><StickyNote aria-hidden="true" size={16} /><span>Interna: {finance.internalNotes}</span></li> : null}
      </ul>

      <dl className="rt-pay">
        <div><dt>Total</dt><dd>{brl(total)}</dd></div>
        {plan?.receipts.map((receipt, index) => <div key={index}><dt>{receipt.label}</dt><dd>{receipt.amount}</dd></div>)}
        {plan?.remainder
          ? <div className="rt-due"><dt>{plan.remainder.label}</dt><dd>{plan.remainder.amount}</dd></div>
          : finance ? <div className="rt-paid"><dt>Situação</dt><dd>Quitado</dd></div> : null}
      </dl>

      <p className={`rt-notice${notice?.state === "falhou" ? " is-failed" : ""}`}>
        <MessageCircle aria-hidden="true" size={15} />
        {ready ? avisoLabel(notice, history, now) : stateText(order, history)}
      </p>

      {ready ? <PickupActions finance={finance} orderId={order.id} paymentMethod={order.paymentMethod} status={order.status} /> : null}
      <Link className="rt-open" href={`/equipe/pedidos/${order.id}`}>Abrir pedido <ArrowRight aria-hidden="true" size={14} /></Link>
    </article>
  );
}

export default async function PickupPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  const orders = q ? search(q) : readyOrders();
  const now = new Date();
  return (
    <>
      <StaffTopbar name={session.user.name} role={session.user.role} current="retirada" />
      <main className="qe-page rt-page">
        <header className="rt-hero">
          <h1 className="qe-title">Retirada</h1>
          <p>Ache o pedido do cliente no balcão pelo número, nome ou empresa, confira os itens e marque a retirada.</p>
        </header>
        <form className="rt-search" role="search">
          <Search aria-hidden="true" size={18} />
          <input aria-label="Buscar pedido" defaultValue={q} name="q" placeholder="Número do pedido, nome ou empresa" />
          {q ? <Link className="rt-clear" href="/equipe/retirada">Limpar</Link> : null}
          <button type="submit">Buscar</button>
        </form>
        <h2 className="rt-section">
          {q ? `Resultado para "${q}"` : "Prontos para retirar"}
          <span>{orders.length}</span>
        </h2>
        {orders.length ? (
          <div className="rt-grid">
            {orders.map((order) => <PickupCard key={order.id} now={now} order={order} />)}
          </div>
        ) : (
          <p className="rt-empty">{q ? "Nenhum pedido encontrado. Confira o número ou tente pelo nome." : "Nenhum pedido pronto esperando o cliente agora."}</p>
        )}
      </main>
    </>
  );
}
