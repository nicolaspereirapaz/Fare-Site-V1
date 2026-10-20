"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { isBrazilianPhone } from "@/lib/account/documents";
import { formatPhoneBR, saveMyContact } from "@/lib/account/profileClient";

/** Nome e sobrenome (o mesmo critério do servidor). */
const fullName = (name: string) => name.trim().split(/\s+/).filter((part) => /\p{L}/u.test(part)).length >= 2;

type AuthMode = "sign-in" | "sign-up";

/** Mensagens do login/cadastro em português (o Better Auth responde em inglês). */
const AUTH_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Senha inválida.",
  INVALID_PASSWORD: "Senha inválida.",
  INVALID_EMAIL: "E-mail inválido.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Entre ou use \"Esqueci minha senha\".",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Entre ou use \"Esqueci minha senha\".",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha está grande demais.",
};

function authErrorMessage(code: string | undefined) {
  return (code && AUTH_ERRORS[code]) || "Não foi possível continuar. Tente novamente.";
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signingUp = mode === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (signingUp && !fullName(name)) return setError("Informe seu nome completo (nome e sobrenome).");
    if (signingUp && !isBrazilianPhone(phone)) return setError("Informe seu WhatsApp com DDD.");
    setPending(true);

    const result = signingUp
      ? await authClient.signUp.email({ name: name.trim().replace(/\s+/g, " "), email, password })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(authErrorMessage(result.error.code));
      setPending(false);
      return;
    }
    // Conta criada (já logada): guarda o WhatsApp, usado no carrinho e nos pedidos.
    // Se falhar, o carrinho pede o telefone uma vez e salva.
    if (signingUp) await saveMyContact({ phone });

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
          <>
            <label><span>Nome completo</span><input autoComplete="name" placeholder="Nome e sobrenome" required value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label><span>WhatsApp</span><input autoComplete="tel" inputMode="tel" placeholder="(11) 90000-0000" required value={phone} onChange={(event) => setPhone(formatPhoneBR(event.target.value))} /></label>
          </>
        ) : null}
        <label><span>E-mail</span><input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Senha</span><input autoComplete={signingUp ? "new-password" : "current-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {signingUp ? null : (
          <Link className="auth-forgot" href="/esqueci-senha">Esqueci minha senha</Link>
        )}
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
