import { describe, expect, it, vi } from "vitest";
import { readVerifiedSession } from "@/lib/auth/session";

describe("readVerifiedSession", () => {
  it("consulta o provedor no servidor com os cabeçalhos da requisição", async () => {
    const headers = new Headers({ cookie: "better-auth.session_token=signed" });
    const session = { session: { id: "session-1" }, user: { id: "user-1", role: "cliente" } };
    const getSession = vi.fn().mockResolvedValue(session);

    await expect(readVerifiedSession(headers, getSession)).resolves.toBe(session);
    expect(getSession).toHaveBeenCalledWith({ headers });
  });

  it("retorna null quando o banco não confirma uma sessão", async () => {
    const getSession = vi.fn().mockResolvedValue(null);

    await expect(readVerifiedSession(new Headers(), getSession)).resolves.toBeNull();
  });
});
