"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signingUp = mode === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = signingUp
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message || "Não foi possível continuar. Tente novamente.");
      setPending(false);
      return;
    }

    router.push("/minha-conta");
    router.refresh();
  }

  return (
    <div className="auth-card">
      <span className="eyebrow">{signingUp ? "Nova conta" : "Área do cliente"}</span>
      <h1>{signingUp ? "Crie sua conta" : "Entre na Fare Foto"}</h1>
      <p>{signingUp ? "Cadastre-se para finalizar compras e acompanhar solicitações." : "Acesse seus pedidos, orçamentos e dados pessoais."}</p>

      <form className="auth-form" onSubmit={submit}>
        {signingUp ? (
          <label><span>Nome</span><input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></label>
        ) : null}
        <label><span>E-mail</span><input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Senha</span><input autoComplete={signingUp ? "new-password" : "current-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button button-primary button-large" disabled={pending} type="submit">
          {pending ? "Aguarde…" : signingUp ? "Criar conta" : "Entrar"}
        </button>
      </form>

      <p className="auth-alternate">
        {signingUp ? "Já tem cadastro?" : "Ainda não tem conta?"}{" "}
        <Link href={signingUp ? "/entrar" : "/cadastro"}>{signingUp ? "Entrar" : "Criar conta"}</Link>
      </p>
    </div>
  );
}
