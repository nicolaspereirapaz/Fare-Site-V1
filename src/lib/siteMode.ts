/**
 * Modo do site publicado. Por enquanto só a campanha Outubro Rosa fica no ar:
 * login, conta, carrinho geral, catálogo, brindes e backoffice ficam inacessíveis.
 * Para voltar ao site completo (desenvolvimento), rode com FARE_FULL_SITE=1.
 */
export const CAMPAIGN_HOME = "/campanhas/outubro-rosa";
export const CAMPAIGN_SITE_HEADER = "x-fare-site";

export function isCampaignOnlyMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.FARE_FULL_SITE !== "1";
}

/** Páginas da campanha (listagem e produtos). */
export function isCampaignPage(pathname: string): boolean {
  return pathname === CAMPAIGN_HOME || pathname.startsWith(`${CAMPAIGN_HOME}/`);
}

/** APIs liberadas no modo campanha: só as da própria campanha. */
export function isCampaignApi(pathname: string): boolean {
  return pathname === "/api/campaigns/outubro-rosa/products" || pathname.startsWith("/api/campaigns/outubro-rosa/products/");
}

/** Arquivos estáticos necessários para a página (JS/CSS do Next, imagens e ícones). */
export function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

export type CampaignGateDecision = "allow" | "redirect" | "not-found";

/** O que fazer com uma requisição quando só a campanha está publicada. */
export function campaignGate(pathname: string): CampaignGateDecision {
  if (isCampaignPage(pathname) || isCampaignApi(pathname) || isStaticAsset(pathname)) return "allow";
  if (pathname.startsWith("/api/")) return "not-found";
  return "redirect";
}
