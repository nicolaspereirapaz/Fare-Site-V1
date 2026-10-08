"use client";

import { type FormEvent, useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const MIN_LENGTH = 8;

const SERVER_ERRORS: Record<string, string> = {
  INVALID_PASSWORD: "A senha atual está incorreta.",
  PASSWORD_TOO_SHORT: `A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`,
  PASSWORD_TOO_LONG: "A nova senha está grande demais.",
};

/** Troca de senha: confere a senha atual no servidor e encerra as sessões em outros aparelhos. */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const touch = () => {
    setState("idle");
    setError(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) return setError(SERVER_ERRORS.PASSWORD_TOO_SHORT);
    if (next !== confirm) return setError("As senhas novas não são iguais.");
    if (next === current) return setError("A nova senha precisa ser diferente da atual.");

    setState("saving");
    try {
      const result = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
      if (result.error) {
        setState("idle");
        setError(SERVER_ERRORS[result.error.code ?? ""] ?? "Não foi possível trocar a senha agora. Tente de novo.");
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setState("saved");
    } catch {
      setState("idle");
      setError("Não foi possível trocar a senha agora. Tente de novo.");
    }
  }

  const type = visible ? "text" : "password";

  return (
    <form className="account-form password-form" noValidate onSubmit={submit}>
      <div className="password-form-head">
        <h2>Trocar senha</h2>
        <button aria-pressed={visible} className="password-toggle" onClick={() => setVisible((value) => !value)} type="button">
          {visible ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
          {visible ? "Esconder senhas" : "Mostrar senhas"}
        </button>
      </div>
      <div className="profile-field">
        <label htmlFor="password-current">Senha atual</label>
        <input autoComplete="current-password" id="password-current" onChange={(e) => { setCurrent(e.target.value); touch(); }} type={type} value={current} />
      </div>
      <div className="profile-grid">
        <div className="profile-field">
          <label htmlFor="password-new">Nova senha</label>
          <input aria-describedby="password-hint" autoComplete="new-password" id="password-new" onChange={(e) => { setNext(e.target.value); touch(); }} type={type} value={next} />
        </div>
        <div className="profile-field">
          <label htmlFor="password-confirm">Repita a nova senha</label>
          <input autoComplete="new-password" id="password-confirm" onChange={(e) => { setConfirm(e.target.value); touch(); }} type={type} value={confirm} />
        </div>
      </div>
      <small className="profile-field-hint" id="password-hint">
        Pelo menos {MIN_LENGTH} caracteres. Ao trocar, você continua conectado aqui e sai dos outros aparelhos.
      </small>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <div className="account-form-actions">
        <button className="button button-secondary" disabled={state === "saving"} type="submit">
          {state === "saving" ? "Trocando…" : "Trocar senha"}
        </button>
        <span aria-live="polite" className="account-form-saved" role="status">
          {state === "saved" ? <><Check aria-hidden="true" size={17} /> Senha alterada</> : null}
        </span>
      </div>
    </form>
  );
}
