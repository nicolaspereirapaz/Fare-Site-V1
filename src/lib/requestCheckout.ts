type CheckoutResult = { requiresAuth: true } | { url: string };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Envia o carrinho: "/api/checkout" (pedido) ou "/api/quotes" (só orçamento). */
export async function requestCheckout(payload: unknown, fetcher: Fetcher = fetch, endpoint = "/api/checkout"): Promise<CheckoutResult> {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) return { requiresAuth: true };
  const data = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error || "Não foi possível finalizar agora.");
  return { url: data.url };
}
