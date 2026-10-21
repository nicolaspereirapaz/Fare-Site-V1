/** Roda uma vez quando o servidor sobe: liga as rotinas de fundo do site. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VITEST) return;
  const [{ database }, { startDocumentFolderSync }, { documentDetailsOf, documentImageOf }, { renderOrderHtml, renderProposalHtml }] = await Promise.all([
    import("@/lib/auth"), import("@/lib/documentFolders"), import("@/lib/proposals/catalogImages"), import("@/lib/proposals/html"),
  ]);
  // Pasta de cada orçamento/pedido (com o arquivo) na pasta de pedidos — o oraculo copia para D:\Digital.
  startDocumentFolderSync(database, {
    imageOf: documentImageOf, detailsOf: documentDetailsOf, renderQuote: renderProposalHtml, renderOrder: renderOrderHtml,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.FARE_SITE_URL || "https://www.farefoto.com.br",
  });
}
