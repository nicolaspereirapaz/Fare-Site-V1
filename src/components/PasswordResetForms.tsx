"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

const MIN_LENGTH = 8;

/** Pede o link por e-mail. A resposta é sempre a mesma, para não revelar quais e-mails têm conta. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/redefinir-senha" });
    } catch {
      // Mesmo em falha a mensagem é igual; o erro real fica no log do servidor.
    }
    setSentTo(email.trim());
    setPending(false);
  }

  return (
    <div className="auth-card">
      <span className="eyebrow">Área do cliente</span>
      <h1>Esqueci minha senha</h1>
      <p>Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</p>

      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>E-mail</span>
          <input autoComplete="email" onChange={(e) => { setEmail(e.target.value); setSentTo(null); }} required type="email" value={email} />
        </label>
        <p aria-live="polite" className={sentTo ? "auth-success" : "visually-hidden"} role="status">
          {sentTo ? `Se existir uma conta com ${sentTo}, você vai receber o link em alguns minutos. Confira também o spam.` : ""}
        </p>
        <button className="button button-primary button-large" disabled={pending} type="submit">
          {pending ? "Enviando…" : "Enviar link"}
        </button>
      </form>

      <p className="auth-alternate">
        Lembrou a senha? <Link href="/entrar">Entrar</Link>
      </p>
    </div>
  );
}

/** Tela aberta pelo link do e-mail (o servidor manda ?token=… ou ?error=INVALID_TOKEN). */
export function ResetPasswordForm({ token, error }: { token: string | null; error: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(Boolean(error) || !token);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (password.length < MIN_LENGTH) return setMessage(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
    if (password !== confirm) return setMessage("As senhas não são iguais.");

    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
      if (result.error) {
        if (result.error.code === "INVALID_TOKEN") setInvalid(true);
        else setMessage("Não foi possível redefinir agora. Tente de novo.");
      } else {
        setDone(true);
      }
    } catch {
      setMessage("Não foi possível redefinir agora. Tente de novo.");
    }
    setPending(false);
  }

  if (invalid) {
    return (
      <div className="auth-card">
        <span className="eyebrow">Área do cliente</span>
        <h1>Link inválido</h1>
        <p>Este link expirou ou já foi usado. Os links valem por 1 hora e funcionam uma vez só.</p>
        <Link className="button button-primary button-large" href="/esqueci-senha">Pedir um novo link</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-card">
        <span className="eyebrow">Área do cliente</span>
        <h1>Tudo certo</h1>
        <p className="auth-success" role="status">Senha redefinida. Por segurança, você saiu da conta em todos os aparelhos.</p>
        <Link className="button button-primary button-large" href="/entrar">Entrar</Link>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <span className="eyebrow">Área do cliente</span>
      <h1>Criar nova senha</h1>
      <p>Escolha uma senha com pelo menos {MIN_LENGTH} caracteres.</p>
      <form className="auth-form" noValidate onSubmit={submit}>
        <label>
          <span>Nova senha</span>
          <input autoComplete="new-password" onChange={(e) => { setPassword(e.target.value); setMessage(null); }} type="password" value={password} />
        </label>
        <label>
          <span>Repita a nova senha</span>
          <input autoComplete="new-password" onChange={(e) => { setConfirm(e.target.value); setMessage(null); }} type="password" value={confirm} />
        </label>
        {message ? <p className="auth-error" role="alert">{message}</p> : null}
        <button className="button button-primary button-large" disabled={pending} type="submit">
          {pending ? "Salvando…" : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
