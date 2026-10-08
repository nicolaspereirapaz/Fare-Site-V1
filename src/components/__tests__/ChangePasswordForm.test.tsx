import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { changePassword } = vi.hoisted(() => ({ changePassword: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { changePassword } }));

import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm = next) {
  await user.type(screen.getByLabelText("Senha atual"), current);
  await user.type(screen.getByLabelText("Nova senha"), next);
  await user.type(screen.getByLabelText("Repita a nova senha"), confirm);
  await user.click(screen.getByRole("button", { name: "Trocar senha" }));
}

describe("trocar senha na Minha conta", () => {
  beforeEach(() => {
    changePassword.mockReset();
    changePassword.mockResolvedValue({ data: {}, error: null });
  });

  it("troca a senha e encerra as outras sessões abertas", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(user, "SenhaAntiga1", "NovaSenha2026");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Senha alterada"));
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: "SenhaAntiga1", newPassword: "NovaSenha2026", revokeOtherSessions: true });
    // limpa os campos depois de trocar
    expect(screen.getByLabelText("Senha atual")).toHaveValue("");
    expect(screen.getByLabelText("Nova senha")).toHaveValue("");
  });

  it("não envia se a confirmação for diferente", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(user, "SenhaAntiga1", "NovaSenha2026", "OutraSenha2026");
    expect(await screen.findByRole("alert")).toHaveTextContent("As senhas novas não são iguais.");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("não envia senha nova curta ou igual à atual", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(user, "SenhaAntiga1", "curta");
    expect(await screen.findByRole("alert")).toHaveTextContent("pelo menos 8 caracteres");

    await user.clear(screen.getByLabelText("Senha atual"));
    await user.clear(screen.getByLabelText("Nova senha"));
    await user.clear(screen.getByLabelText("Repita a nova senha"));
    await fill(user, "MesmaSenha1", "MesmaSenha1");
    expect(await screen.findByRole("alert")).toHaveTextContent("diferente da atual");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("avisa quando a senha atual está errada", async () => {
    changePassword.mockResolvedValue({ data: null, error: { code: "INVALID_PASSWORD", message: "Invalid password" } });
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await fill(user, "Errada123", "NovaSenha2026");
    expect(await screen.findByRole("alert")).toHaveTextContent("A senha atual está incorreta.");
  });

  it("mostra e esconde as senhas", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar senhas" }));
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "text");
  });
});
