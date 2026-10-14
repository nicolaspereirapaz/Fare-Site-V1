import Link from "next/link";
import { CalendarDays, ClipboardList, MessageCircle, Wallet } from "lucide-react";
import type { StatusPedido } from "@/lib/backoffice/orderStatus";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/orders/labels";
import { orderCode } from "@/lib/orders/orderCode";
import type { PaymentMethod } from "@/lib/orders/repository";

export type AccountOrder = {
  id: string;
  status: StatusPedido;
  paymentMethod: PaymentMethod;
  totalCents: number | null;
  /** Desconto vindo do orçamento (rótulo e valor), sem nada interno. */
  discount?: { label: string; amount: number } | null;
  createdAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    quantityRange?: string;
    color: string | null;
    unitPrice: number | null;
  }>;
};

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const formatDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
}).format(new Date(iso));

export function AccountOrders({ orders }: { orders: AccountOrder[] }) {
  if (!orders.length) {
    return (
      <div className="account-empty">
        <ClipboardList aria-hidden="true" size={32} />
        <p>Nenhum pedido por enquanto.</p>
        <small>Quando você finalizar um pedido, ele aparece aqui para acompanhar.</small>
        <Link className="button button-primary" href="/brindes">Ver brindes</Link>
      </div>
    );
  }

  return (
    <div className="account-order-list">
      {orders.map((order) => {
        const code = orderCode(order.id);
        const titleId = `pedido-${order.id}`;
        return (
          <article aria-labelledby={titleId} className="account-order" key={order.id}>
            <header className="account-order-heading">
              <div>
                <h2 id={titleId}>Pedido #{code}</h2>
                <ul className="account-order-meta">
                  <li><CalendarDays aria-hidden="true" size={14} /> {formatDate(order.createdAt)}</li>
                  <li><Wallet aria-hidden="true" size={14} /> Pagamento: {PAYMENT_METHOD_LABELS[order.paymentMethod]}</li>
                </ul>
              </div>
              <span className={`account-order-status status-${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span>
            </header>

            {order.status === "aguardando_pagamento" ? (
              <p className="account-order-note">A equipe vai confirmar valores, prazo e pagamento pelo WhatsApp.</p>
            ) : null}

            <ul className="account-order-items">
              {order.items.map((item, index) => (
                <li key={`${order.id}-${index}`}>
                  <span>
                    <strong>{item.productName}</strong>
                    {item.color ? <small> · {item.color}</small> : null}
                  </span>
                  <span>{item.quantityRange ?? `${item.quantity} un.`}</span>
                  <span>{item.unitPrice === null ? "sob consulta" : `${brl(item.unitPrice)}/un.`}</span>
                </li>
              ))}
            </ul>

            <footer className="account-order-footer">
              {order.discount ? (
                <p className="account-quote-discount">
                  <span>{order.discount.label}</span>{" "}
                  <strong>− {brl(order.discount.amount)}</strong>
                </p>
              ) : null}
              <p>
                <span>Total estimado</span>{" "}
                <strong>{order.totalCents === null ? "sob consulta" : brl(order.totalCents / 100)}</strong>
              </p>
              <a
                className="button button-secondary"
                href={buildWhatsAppUrl(FARE_FOTO_WHATSAPP, `Olá! Gostaria de falar sobre o pedido #${code}.`)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MessageCircle aria-hidden="true" size={17} /> Falar sobre este pedido
              </a>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
