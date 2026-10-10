import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestPasswordReset, resetPassword } = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { requestPasswordReset, resetPassword } }));

import { ForgotPasswordForm, ResetPasswordForm } from "@/components/PasswordResetForms";

describe("esqueci minha senha", () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
  });

  it("pede o link e mostra a mesma mensagem exista ou não a conta", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("E-mail"), "ana@x.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Se existir uma conta com ana@x.com"));
    expect(requestPasswordReset).toHaveBeenCalledWith({ email: "ana@x.com", redirectTo: "/redefinir-senha" });
  });

  it("mesmo se o servidor recusar, não revela se o e-mail existe", async () => {
    requestPasswordReset.mockResolvedValue({ data: null, error: { code: "X", message: "x" } });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("E-mail"), "nao@existe.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Se existir uma conta");
  });
});

describe("redefinir senha pelo link", () => {
  beforeEach(() => {
    resetPassword.mockReset();
    resetPassword.mockResolvedValue({ data: { status: true }, error: null });
  });

  it("define a nova senha com o token do link", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok123" error={null} />);
    await user.type(screen.getByLabelText("Nova senha"), "NovaSenha2026");
    await user.type(screen.getByLabelText("Repita a nova senha"), "NovaSenha2026");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Senha redefinida"));
    expect(resetPassword).toHaveBeenCalledWith({ newPassword: "NovaSenha2026", token: "tok123" });
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
  });

  it("confere tamanho e confirmação antes de enviar", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok123" error={null} />);
    await user.type(screen.getByLabelText("Nova senha"), "curta");
    await user.type(screen.getByLabelText("Repita a nova senha"), "curta");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pelo menos 8 caracteres");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("link vencido ou já usado: explica e oferece pedir outro", async () => {
    render(<ResetPasswordForm token={null} error="INVALID_TOKEN" />);
    expect(screen.getByText(/link expirou ou já foi usado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir um novo link" })).toHaveAttribute("href", "/esqueci-senha");
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });

  it("token recusado pelo servidor também mostra o aviso de link inválido", async () => {
    resetPassword.mockResolvedValue({ data: null, error: { code: "INVALID_TOKEN", message: "invalid token" } });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="velho" error={null} />);
    await user.type(screen.getByLabelText("Nova senha"), "NovaSenha2026");
    await user.type(screen.getByLabelText("Repita a nova senha"), "NovaSenha2026");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByText(/link expirou ou já foi usado/)).toBeInTheDocument();
  });
});
