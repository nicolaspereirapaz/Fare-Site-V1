import { NextResponse, type NextRequest } from "next/server";
import { CAMPAIGN_HOME, CAMPAIGN_SITE_HEADER, campaignGate, isCampaignOnlyMode } from "@/lib/siteMode";

/**
 * Isola a campanha Outubro Rosa: qualquer outra página redireciona para ela e as demais
 * APIs (login, conta, pedidos, backoffice, catálogo geral) respondem 404.
 */
export function proxy(request: NextRequest) {
  if (!isCampaignOnlyMode()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const decision = campaignGate(pathname);

  if (decision === "not-found") {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }
  if (decision === "redirect") {
    return NextResponse.redirect(new URL(CAMPAIGN_HOME, request.url), 307);
  }

  // Avisa o layout para usar o cabeçalho da campanha (sem login, menu ou carrinho geral).
  const headers = new Headers(request.headers);
  headers.set(CAMPAIGN_SITE_HEADER, "campaign");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Ignora apenas os arquivos internos do Next; o resto passa pelo filtro acima.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
