/** Mutações financeiras da equipe: JSON e origem exata do endpoint. */
export function financialMutationGuard(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  // Next start pode construir request.url com localhost mesmo numa requisição LAN.
  // Host é o destino real do navegador; não confiar em X-Forwarded-Host arbitrário.
  const target = new URL(request.url);
  const host = request.headers.get("host");
  const expectedOrigin = host ? `${target.protocol}//${host}` : target.origin;
  if (origin && origin !== expectedOrigin
    || site === "cross-site" || !origin && site && site !== "same-origin" && site !== "none") {
    return Response.json({ error: "FORBIDDEN", message: "Origem da requisição não permitida." }, { status: 403 });
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return Response.json({ error: "INVALID_REQUEST", message: "Envie os dados em JSON." }, { status: 415 });
  return null;
}
