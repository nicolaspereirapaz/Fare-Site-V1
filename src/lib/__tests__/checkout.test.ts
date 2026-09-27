import { describe, expect, it, vi } from "vitest";
import { createCheckoutHandler } from "@/lib/checkout";

const body = {
  customer: { name: "Ana", phone: "11999999999" },
  items: [{
    id: "item-1",
    productName: "Foto 10x15",
    slug: "foto-10x15",
    quantity: 1,
    selections: {},
    unitPrice: 2,
  }],
};

function request() {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "better-auth.session_token=qualquer" },
    body: JSON.stringify(body),
  });
}

describe("checkout protegido", () => {
  it("nega a finalização quando a sessão não é confirmada pelo servidor", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const response = await createCheckoutHandler(getSession)(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession.mock.calls[0][0].headers.get("cookie")).toContain("better-auth.session_token");
  });

  it("libera a URL de finalização para uma sessão válida", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const response = await createCheckoutHandler(getSession)(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toMatch(/^https:\/\/wa\.me\//);
  });
});
