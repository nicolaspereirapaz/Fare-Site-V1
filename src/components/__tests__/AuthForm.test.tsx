import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/AuthForm";
import { authClient } from "@/lib/auth-client";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
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

  it("cadastra nome, e-mail e senha sem permitir escolher papel", async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({ data: {} as never, error: null });
    render(<AuthForm mode="sign-up" />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Silva" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo123" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(authClient.signUp.email).toHaveBeenCalledWith({
      name: "Ana Silva",
      email: "ana@example.com",
      password: "segredo123",
    }));
    expect(screen.queryByLabelText("Papel")).not.toBeInTheDocument();
  });
});
