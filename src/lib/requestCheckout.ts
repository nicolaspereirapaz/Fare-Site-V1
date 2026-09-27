type CheckoutResult = { requiresAuth: true } | { url: string };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestCheckout(payload: unknown, fetcher: Fetcher = fetch): Promise<CheckoutResult> {
  const response = await fetcher("/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) return { requiresAuth: true };
  const data = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error || "Não foi possível finalizar agora.");
  return { url: data.url };
}
