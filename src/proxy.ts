import { NextResponse, type NextRequest } from "next/server";
import { temporaryAccessEnabled } from "@/lib/auth/temporaryAccess";
import { createGuestToken, readGuestId, GUEST_COOKIE, GUEST_MAX_AGE } from "@/lib/auth/temporaryGuest";
import { CAMPAIGN_HOME, CAMPAIGN_SITE_HEADER, campaignGate, isCampaignOnlyMode } from "@/lib/siteMode";

/**
 * Isola a campanha Outubro Rosa: qualquer outra página redireciona para ela e as demais
 * APIs (login, conta, pedidos, backoffice, catálogo geral) respondem 404.
 */
export function proxy(request: NextRequest) {
  if (!isCampaignOnlyMode()) {
    if (!temporaryAccessEnabled()) return NextResponse.next();
    const pathname = request.nextUrl.pathname;
    // Team has its own explicit temporary actor; never mint customer identities for assets/auth.
    if (pathname.startsWith("/equipe") || pathname.startsWith("/api/backoffice") || pathname.startsWith("/api/equipe") || pathname.startsWith("/api/auth") || /\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();
    if (readGuestId(request.headers)) return NextResponse.next();
    const token = createGuestToken();
    const headers = new Headers(request.headers);
    const cookies = (headers.get("cookie") ?? "").split(";").map(s => s.trim()).filter(s => s && !s.startsWith(`${GUEST_COOKIE}=`));
    headers.set("cookie", [...cookies, `${GUEST_COOKIE}=${token}`].join("; "));
    const response = NextResponse.next({ request: { headers } });
    response.cookies.set(GUEST_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
      path: "/", maxAge: GUEST_MAX_AGE,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

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
  // Ignora os arquivos internos do Next e o envio de fotos; o resto passa pelo filtro acima.
  // O envio de fotos fica de fora porque o proxy guardaria o arquivo inteiro na memória (e corta acima de 10 MB);
  // a própria rota (/api/fotos/envios) se bloqueia no modo campanha.
  matcher: ["/((?!_next/static|_next/image|api/fotos/envios$).*)"],
};
