"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { staffAuthClient } from "@/lib/staff/client";

const MIN_LENGTH = 10;

const SIGN_IN_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Senha inválida.",
  INVALID_PASSWORD: "Senha inválida.",
  INVALID_EMAIL: "E-mail inválido.",
};

function StaffBrand() {
  return (
    <div className="staff-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Fare Foto" height={60} src="/images/fare-foto-logo.svg" width={110} />
      <span>Equipe</span>
    </div>
  );
}

export function StaffSignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await staffAuthClient.signIn.email({ email: email.trim(), password });
    if (result.error) {
      setError(SIGN_IN_ERRORS[result.error.code ?? ""] ?? "Não foi possível entrar. Tente novamente.");
      setPending(false);
      return;
    }
    router.push("/equipe");
    router.refresh();
  }

  return (
    <div className="staff-auth-card">
      <StaffBrand />
      <h1>Área da equipe</h1>
      <p>Acesso só para funcionários da Fare Foto. As contas são criadas por convite.</p>
      <form className="auth-form" onSubmit={submit}>
        <label><span>E-mail</span><input autoComplete="username" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} /></label>
        <label><span>Senha</span><input autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required type="password" value={password} /></label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button button-primary button-large" disabled={pending} type="submit">
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="staff-auth-hint">Esqueceu a senha? Peça um novo convite ao administrador.</p>
    </div>
  );
}

export function StaffInviteForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(!token);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
    if (password !== confirm) return setError("As senhas não são iguais.");
    setPending(true);
    const result = await staffAuthClient.resetPassword({ newPassword: password, token: token ?? "" });
    setPending(false);
    if (!result.error) return setDone(true);
    if (result.error.code === "INVALID_TOKEN") return setInvalid(true);
    setError("Não foi possível criar a senha. Tente de novo.");
  }

  if (invalid) {
    return (
      <div className="staff-auth-card">
        <StaffBrand />
        <h1>Convite inválido</h1>
        <p>Este convite expirou ou já foi usado. Os convites valem por 48 horas e funcionam uma vez só. Peça um novo ao administrador.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="staff-auth-card">
        <StaffBrand />
        <h1>Tudo pronto</h1>
        <p className="auth-success" role="status">Senha criada. Agora é só entrar com o seu e-mail e a nova senha.</p>
        <Link className="button button-primary button-large" href="/equipe/entrar">Entrar no painel</Link>
      </div>
    );
  }

  return (
    <div className="staff-auth-card">
      <StaffBrand />
      <h1>Criar sua senha</h1>
      <p>Bem-vindo(a) à equipe! Crie uma senha com pelo menos {MIN_LENGTH} caracteres.</p>
      <form className="auth-form" noValidate onSubmit={submit}>
        <label><span>Nova senha</span><input autoComplete="new-password" onChange={(e) => { setPassword(e.target.value); setError(null); }} type="password" value={password} /></label>
        <label><span>Repita a nova senha</span><input autoComplete="new-password" onChange={(e) => { setConfirm(e.target.value); setError(null); }} type="password" value={confirm} /></label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button button-primary button-large" disabled={pending} type="submit">
          {pending ? "Salvando…" : "Criar senha"}
        </button>
      </form>
    </div>
  );
}
