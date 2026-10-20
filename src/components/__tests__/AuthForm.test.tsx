import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/AuthForm";
import { authClient } from "@/lib/auth-client";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const { saveMyContact } = vi.hoisted(() => ({ saveMyContact: vi.fn() }));
vi.mock("@/lib/account/profileClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/profileClient")>()),
  saveMyContact,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

describe("AuthForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("autentica por e-mail e senha e segue para a conta", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({ data: {} as never, error: null });
    render(<AuthForm mode="sign-in" />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(authClient.signIn.email).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "segredo123",
    }));
    expect(push).toHaveBeenCalledWith("/minha-conta");
  });

  it("cadastra nome completo, WhatsApp, e-mail e senha sem permitir escolher papel", async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({ data: {} as never, error: null });
    saveMyContact.mockResolvedValue(null);
    render(<AuthForm mode="sign-up" />);

    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Ana Silva" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "11988887777" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo123" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(authClient.signUp.email).toHaveBeenCalledWith({
      name: "Ana Silva",
      email: "ana@example.com",
      password: "segredo123",
    }));
    await waitFor(() => expect(saveMyContact).toHaveBeenCalledWith({ phone: "(11) 98888-7777" }));
    expect(screen.queryByLabelText("Papel")).not.toBeInTheDocument();
  });

  it("cadastro exige nome e sobrenome e WhatsApp com DDD", async () => {
    render(<AuthForm mode="sign-up" />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo123" } });
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "11988887777" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nome completo");
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Ana Silva" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "9888" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("WhatsApp com DDD");
    expect(authClient.signUp.email).not.toHaveBeenCalled();
  });

  it("na tela de entrar tem o link 'Esqueci minha senha'", () => {
    render(<AuthForm mode="sign-in" />);
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toHaveAttribute("href", "/esqueci-senha");
  });

  it("senha errada aparece em português: 'Senha inválida.'", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: null, error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password", status: 401, statusText: "" },
    } as never);
    render(<AuthForm mode="sign-in" />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "errada123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Senha inválida.");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/invalid/i);
  });

  it("outros erros do login e do cadastro também em português", async () => {
    const cases: Array<[string, RegExp]> = [
      ["INVALID_PASSWORD", /^Senha inválida\.$/],
      ["USER_ALREADY_EXISTS", /Já existe uma conta com este e-mail/],
      ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", /Já existe uma conta com este e-mail/],
      ["PASSWORD_TOO_SHORT", /pelo menos 8 caracteres/],
      ["INVALID_EMAIL", /E-mail inválido/],
      ["ALGO_DESCONHECIDO", /Não foi possível continuar/],
    ];
    for (const [code, expected] of cases) {
      vi.mocked(authClient.signUp.email).mockResolvedValue({
        data: null, error: { code, message: "english message", status: 400, statusText: "" },
      } as never);
      const { unmount } = render(<AuthForm mode="sign-up" />);
      fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Ana Silva" } });
      fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "11988887777" } });
      fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
      fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo123" } });
      fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(expected);
      expect(screen.getByRole("alert")).not.toHaveTextContent("english message");
      unmount();
    }
  });
});
