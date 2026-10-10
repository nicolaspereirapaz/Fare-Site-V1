import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Email = { to: string; subject: string; text: string; html: string };
export type Mailer = { kind: "resend" | "outbox" | "disabled"; send: (email: Email) => Promise<void> };
type MailerEnv = Partial<Record<"NODE_ENV" | "RESEND_API_KEY" | "EMAIL_FROM", string>>;
type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>;

/**
 * Envio de e-mail do site.
 * - Produção: Resend (https://resend.com), com RESEND_API_KEY e EMAIL_FROM no .env.local.
 * - Desenvolvimento sem chave: grava o e-mail em data/outbox/ (pasta fora do git) para testar o fluxo.
 * - Produção sem chave: não envia e registra o erro no log.
 */
export function createMailer(
  env: MailerEnv = process.env,
  { fetcher = fetch as Fetcher, outboxDir = path.join(process.cwd(), "data", "outbox") }: { fetcher?: Fetcher; outboxDir?: string } = {},
): Mailer {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();

  if (apiKey && from) {
    return {
      kind: "resend",
      async send(email) {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
        });
        if (!response.ok) throw new Error(`Resend recusou o envio (HTTP ${response.status}).`);
      },
    };
  }

  if (env.NODE_ENV !== "production") {
    return {
      kind: "outbox",
      async send(email) {
        mkdirSync(outboxDir, { recursive: true });
        const file = path.join(outboxDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${email.to.replace(/[^a-z0-9@._-]/gi, "_")}.json`);
        writeFileSync(file, JSON.stringify(email, null, 2), "utf8");
        console.info(`[e-mail] modo desenvolvimento: salvo em ${file}`);
      },
    };
  }

  return {
    kind: "disabled",
    async send(email) {
      console.error(`[e-mail] não enviado para ${email.to}: configure RESEND_API_KEY e EMAIL_FROM no servidor.`);
    },
  };
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export function buildPasswordResetEmail(user: { name: string; email: string }, url: string): Email {
  const firstName = user.name.trim().split(/\s+/)[0] || "cliente";
  const text = [
    `Olá, ${firstName}!`,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta na Fare Foto.",
    "Para criar uma nova senha, abra o link abaixo (ele vale por 1 hora):",
    "",
    url,
    "",
    "Se não foi você, ignore este e-mail: sua senha continua a mesma.",
    "",
    "Fare Foto",
  ].join("\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f2f2f3;font-family:Arial,sans-serif;color:#1d2447">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:20px">Redefinir sua senha</h1>
    <p>Olá, ${escapeHtml(firstName)}!</p>
    <p>Recebemos um pedido para redefinir a senha da sua conta na Fare Foto.</p>
    <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#e8562a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Criar nova senha</a></p>
    <p style="font-size:13px;color:#555">O link vale por 1 hora. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
  </div></body></html>`;
  return { to: user.email, subject: "Redefinir sua senha — Fare Foto", text, html };
}
