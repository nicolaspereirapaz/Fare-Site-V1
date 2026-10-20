import type { SessionReader } from "@/lib/auth/session";
import type { DatabaseSync } from "node:sqlite";
import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import type { QuoteCartItem } from "@/lib/commerce";
import { buildProposal, proposalWhatsAppText, proposalWhatsAppUrl, type ProductDetails, type Proposal } from "@/lib/proposals/proposal";
import { findQuoteById, markProposalSent } from "@/lib/quotes/repository";

/** Rotas da proposta: GET baixa o HTML; POST marca como enviada e devolve a mensagem do WhatsApp. */

export type ProposalDeps = {
  getSession: SessionReader<{ user: { id: string; name: string; role?: unknown } }>;
  database: () => DatabaseSync;
  siteUrl: string;
  /** Foto da cor escolhida (catálogo do servidor). */
  imageOf: (item: QuoteCartItem) => Promise<string | null>;
  /** Descrição e medidas do produto; sem isso a proposta sai sem elas. */
  detailsOf?: (item: QuoteCartItem) => Promise<ProductDetails>;
  render: (proposal: Proposal) => Promise<string>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function createProposalHandlers(deps: ProposalDeps) {
  async function prepare(request: Request, quoteId: string) {
    const session = await deps.getSession({ headers: request.headers });
    if (!session) return { error: json({ error: "AUTH_REQUIRED" }, 401) };
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return { error: json({ error: "FORBIDDEN" }, 403) };
    const quote = findQuoteById(deps.database(), quoteId);
    if (!quote) return { error: json({ error: "QUOTE_NOT_FOUND" }, 404) };
    const images = new Map<string, string | null>();
    const details = new Map<string, ProductDetails | null>();
    await Promise.all(quote.items.map(async (item) => {
      images.set(item.id, await deps.imageOf(item).catch(() => null));
      details.set(item.id, (await deps.detailsOf?.(item).catch(() => null)) ?? null);
    }));
    // Quem atende é quem está gerando; só o primeiro nome aparece para o cliente.
    const seller = session.user.name.trim().split(/\s+/)[0] || "Equipe";
    try {
      return { quote, proposal: buildProposal(quote, { seller, siteUrl: deps.siteUrl, imageOf: (item) => images.get(item.id) ?? null, detailsOf: (item) => details.get(item.id) ?? null }) };
    } catch (error) {
      return { error: json({ error: "CANNOT_PROPOSE", message: error instanceof Error ? error.message : "Não foi possível gerar." }, 409) };
    }
  }

  return {
    async pdf(request: Request, quoteId: string) {
      const ready = await prepare(request, quoteId);
      if (ready.error) return ready.error;
      const pdf = await deps.render(ready.proposal);
      return new Response(pdf, {
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Content-Disposition": `${new URL(request.url).searchParams.get("ver") === "1" ? "inline" : "attachment"}; filename="Proposta-${ready.proposal.code}.html"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },

    async send(request: Request, quoteId: string) {
      const ready = await prepare(request, quoteId);
      if (ready.error) return ready.error;
      let updated;
      try {
        updated = markProposalSent(deps.database(), quoteId, new Date(), ready.quote.updatedAt);
      } catch (error) {
        return json({ error: "QUOTE_CHANGED", message: error instanceof Error ? error.message : "O orçamento mudou." }, 409);
      }
      return json({
        text: proposalWhatsAppText(ready.proposal),
        whatsappUrl: proposalWhatsAppUrl(ready.proposal),
        status: updated.status,
        proposalSentAt: updated.proposalSentAt,
      });
    },
  };
}
