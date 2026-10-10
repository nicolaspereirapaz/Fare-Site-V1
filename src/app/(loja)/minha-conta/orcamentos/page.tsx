import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountQuotes } from "@/components/account/AccountQuotes";
import { database } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth/server";
import { listQuotesByUser } from "@/lib/quotes/repository";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function AccountQuotesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/entrar");

  // Só o que o cliente precisa ver.
  const quotes = listQuotesByUser(database, session.user.id).map((quote) => ({
    id: quote.id,
    status: quote.status,
    totalCents: quote.totalCents,
    createdAt: quote.createdAt,
    items: quote.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      color: item.selections?.["Variação"] ?? null,
      unitPrice: item.unitPrice,
    })),
  }));

  return (
    <>
      <header className="account-content-heading">
        <h1>Orçamentos</h1>
        <p>Orçamentos pedidos pelo site. A equipe responde pelo WhatsApp.</p>
      </header>
      <AccountQuotes quotes={quotes} />
    </>
  );
}
