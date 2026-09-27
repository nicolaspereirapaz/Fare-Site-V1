import { describe, expect, it, vi } from "vitest";
import { requestCheckout } from "@/lib/requestCheckout";

const payload = { customer: { name: "Ana" }, items: [{ id: "1" }] };

describe("requestCheckout", () => {
  it("identifica quando o visitante precisa entrar", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), { status: 401 }));

    await expect(requestCheckout(payload, fetcher)).resolves.toEqual({ requiresAuth: true });
  });

  it("retorna a URL validada pelo servidor para usuário autenticado", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ url: "https://wa.me/5511" }));

    await expect(requestCheckout(payload, fetcher)).resolves.toEqual({ url: "https://wa.me/5511" });
    expect(fetcher).toHaveBeenCalledWith("/api/checkout", expect.objectContaining({ method: "POST" }));
  });
});
