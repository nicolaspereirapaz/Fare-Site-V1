import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountOrders } from "@/components/account/AccountOrders";
import { database } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth/server";
import { listOrdersByUser } from "@/lib/orders/repository";

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
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      quantityRange: item.quantityRange,
      color: item.selections?.["Variação"] ?? null,
      unitPrice: item.unitPrice,
    })),
  }));

  return (
    <>
      <header className="account-content-heading">
        <h1>Pedidos</h1>
        <p>Acompanhe o andamento dos pedidos enviados pelo site.</p>
      </header>
      <AccountOrders orders={orders} />
    </>
  );
}
