import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, refresh, signIn, signOut, resetPassword } = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), resetPassword: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/staff/client", () => ({ staffAuthClient: { signIn: { email: signIn }, signOut, resetPassword } }));

import { StaffInviteForm, StaffSignInForm } from "@/components/staff/StaffForms";
import { StaffTopbar } from "@/components/staff/StaffTopbar";

describe("entrar na área da equipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn.mockResolvedValue({ data: {}, error: null });
  });

  it("usa o login da equipe (não o de clientes) e abre o painel", async () => {
    const user = userEvent.setup();
    render(<StaffSignInForm />);
    expect(screen.getByRole("heading", { name: "Área da equipe" })).toBeInTheDocument();
    expect(screen.queryByText(/Criar conta/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("E-mail"), "joana@farefoto.com.br");
    await user.type(screen.getByLabelText("Senha"), "SenhaDaEquipe!2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ email: "joana@farefoto.com.br", password: "SenhaDaEquipe!2026" }));
    expect(push).toHaveBeenCalledWith("/equipe");
  });

  it("senha errada: 'Senha inválida.'", async () => {
    signIn.mockResolvedValue({ data: null, error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } });
    const user = userEvent.setup();
    render(<StaffSignInForm />);
    await user.type(screen.getByLabelText("E-mail"), "joana@farefoto.com.br");
    await user.type(screen.getByLabelText("Senha"), "errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Senha inválida.");
  });
});

describe("criar senha pelo convite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPassword.mockResolvedValue({ data: { status: true }, error: null });
  });

  it("cria a senha (mínimo 10 caracteres) e leva para entrar", async () => {
    const user = userEvent.setup();
    render(<StaffInviteForm token="tok" />);
    await user.type(screen.getByLabelText("Nova senha"), "curta12");
    await user.type(screen.getByLabelText("Repita a nova senha"), "curta12");
    await user.click(screen.getByRole("button", { name: "Criar senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pelo menos 10 caracteres");
    expect(resetPassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Nova senha"));
    await user.clear(screen.getByLabelText("Repita a nova senha"));
    await user.type(screen.getByLabelText("Nova senha"), "SenhaDaEquipe!2026");
    await user.type(screen.getByLabelText("Repita a nova senha"), "SenhaDaEquipe!2026");
    await user.click(screen.getByRole("button", { name: "Criar senha" }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ newPassword: "SenhaDaEquipe!2026", token: "tok" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Senha criada");
    expect(screen.getByRole("link", { name: "Entrar no painel" })).toHaveAttribute("href", "/equipe/entrar");
  });

  it("convite vencido ou já usado", async () => {
    render(<StaffInviteForm token={null} />);
    expect(screen.getByText(/convite expirou ou já foi usado/)).toBeInTheDocument();
  });
});

describe("barra da equipe", () => {
  it("mostra quem está logado, o papel e sai pelo login da equipe", async () => {
    signOut.mockResolvedValue({});
    const user = userEvent.setup();
    render(<StaffTopbar name="Joana Lima" role="vendedor" />);
    expect(screen.getByText("Joana Lima")).toBeInTheDocument();
    expect(screen.getByText("Vendedor")).toBeInTheDocument();
    // Logo padrão do site (o mesmo do topo da loja), não a versão laranja para fundo escuro.
    const logo = screen.getByAltText("Fare Foto");
    expect(logo.getAttribute("src")).toContain("/images/fare-foto-logo-slogan.svg");
    await user.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/equipe/entrar");
  });
});
