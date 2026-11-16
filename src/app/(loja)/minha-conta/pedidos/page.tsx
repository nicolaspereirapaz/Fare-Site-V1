import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountOrders } from "@/components/account/AccountOrders";
import { database } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth/server";
import { creditBalanceCents } from "@/lib/customers/credit";
import { listOrdersByUser } from "@/lib/orders/repository";
import { creditOf, discountLine, freightOf } from "@/lib/quotes/discount";

export const metadata: Metadata = { title: "Meus pedidos" };

export default async function AccountOrdersPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/entrar");

  // Só o que o cliente precisa ver; nada de dados internos do pedido.
  const orders = listOrdersByUser(database, session.user.id).map((order) => ({
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totalCents: order.totalCents,
    discount: discountLine(order.discount, order.items),
    freight: freightOf(order.discount),
    credit: creditOf(order.discount),
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      quantityRange: item.quantityRange,
      color: item.selections?.["Variação"] ?? null,
      unitPrice: item.unitPrice,
    })),
  }));

  const creditCents = creditBalanceCents(database, session.user.id);
  return (
    <>
      <header className="account-content-heading">
        <h1>Pedidos</h1>
        <p>Acompanhe o andamento dos pedidos enviados pelo site.</p>
      </header>
      {creditCents > 0 ? (
        <p className="account-credit" role="status">
          Você tem <strong>{(creditCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong> de crédito na Fare Foto. Use no seu próximo pedido com a nossa equipe.
        </p>
      ) : null}
      <AccountOrders orders={orders} />
    </>
  );
}
