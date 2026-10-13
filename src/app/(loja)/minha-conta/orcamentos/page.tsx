import { discountLine } from "@/lib/quotes/discount";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountQuotes } from "@/components/account/AccountQuotes";
import { database } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth/server";
import { accountQuoteOwners } from "@/lib/customers/repository";
import { listQuotesByOwners } from "@/lib/quotes/repository";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function AccountQuotesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/entrar");

  // Só o que o cliente precisa ver. Inclui os orçamentos que a equipe montou para o mesmo e-mail (confirmado).
  const quotes = listQuotesByOwners(database, accountQuoteOwners(database, session.user.id)).map((quote) => ({
    id: quote.id,
    status: quote.status,
    totalCents: quote.totalCents,
    discount: discountLine(quote.discount, quote.totalCents),
    createdAt: quote.createdAt,
    items: quote.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      color: item.selections?.["Variação"] ?? null,
      unitPrice: item.unitPrice,
      // Técnica e local (sem custo).
      gravacoes: (item.gravacoes ?? []).map((g) => (g.local ? `${g.descricao} (${g.local})` : g.descricao)),
    })),
  }));

  return (
    <>
      <header className="account-content-heading">
        <h1>Orçamentos</h1>
        <p>Orçamentos pedidos pelo site ou preparados pela nossa equipe. Respondemos pelo WhatsApp.</p>
      </header>
      <AccountQuotes quotes={quotes} />
    </>
  );
}
