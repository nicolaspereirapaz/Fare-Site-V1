import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildPasswordResetEmail, createMailer } from "@/lib/email/mailer";

const EMAIL = { to: "ana@x.com", subject: "Assunto", text: "Texto", html: "<p>Texto</p>" };

describe("e-mail de redefinição de senha", () => {
  it("tem assunto, link e prazo, em texto e HTML (com o nome escapado)", () => {
    const email = buildPasswordResetEmail({ name: "<b>Ana", email: "ana@x.com" }, "https://farefoto.com.br/api/auth/reset-password/abc?callbackURL=%2Fredefinir-senha");
    expect(email.to).toBe("ana@x.com");
    expect(email.subject).toBe("Redefinir sua senha — Fare Foto");
    expect(email.text).toContain("https://farefoto.com.br/api/auth/reset-password/abc?callbackURL=%2Fredefinir-senha");
    expect(email.text).toContain("1 hora");
    expect(email.html).toContain('href="https://farefoto.com.br/api/auth/reset-password/abc?callbackURL=%2Fredefinir-senha"');
    expect(email.html).toContain("Olá, &lt;b&gt;Ana!");
    expect(email.html).not.toContain("<b>");
  });
});

describe("envio de e-mail", () => {
  it("com RESEND_API_KEY e EMAIL_FROM, envia pela API do Resend", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    const mailer = createMailer({ RESEND_API_KEY: "re_teste", EMAIL_FROM: "Fare Foto <nao-responda@farefoto.com.br>" }, { fetcher });
    expect(mailer.kind).toBe("resend");
    await mailer.send(EMAIL);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_teste");
    expect(JSON.parse(init.body)).toEqual({ from: "Fare Foto <nao-responda@farefoto.com.br>", to: ["ana@x.com"], subject: "Assunto", text: "Texto", html: "<p>Texto</p>" });
  });

  it("falha do Resend vira erro (para aparecer no log)", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("quota", { status: 429 }));
    const mailer = createMailer({ RESEND_API_KEY: "re_teste", EMAIL_FROM: "x@farefoto.com.br" }, { fetcher });
    await expect(mailer.send(EMAIL)).rejects.toThrow(/429/);
  });

  it("sem configuração, em desenvolvimento, guarda o e-mail numa pasta local", async () => {
    const outbox = mkdtempSync(path.join(tmpdir(), "outbox-"));
    const mailer = createMailer({ NODE_ENV: "development" }, { outboxDir: outbox });
    expect(mailer.kind).toBe("outbox");
    await mailer.send(EMAIL);
    const files = readdirSync(outbox);
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(path.join(outbox, files[0]), "utf8"))).toMatchObject(EMAIL);
  });

  it("sem configuração, em produção, não envia e avisa no log", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mailer = createMailer({ NODE_ENV: "production" });
    expect(mailer.kind).toBe("disabled");
    await mailer.send(EMAIL);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("RESEND_API_KEY"));
    warn.mockRestore();
  });
});
