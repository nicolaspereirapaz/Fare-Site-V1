import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { EMPTY_PROFILE, type AccountProfileData } from "@/lib/account/profile";

const { refresh, lookupCep } = vi.hoisted(() => ({ refresh: vi.fn(), lookupCep: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/account/profileClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/profileClient")>()),
  lookupCep,
}));

const INITIAL: AccountProfileData = { ...EMPTY_PROFILE, name: "Ana Silva", email: "ana@example.com", complete: false };

async function fillAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("CEP"), "13201000");
  await waitFor(() => expect(screen.getByLabelText("Rua")).toHaveValue("Rua Barão de Jundiaí"));
  await user.type(screen.getByLabelText("Número"), "100");
}

describe("cadastro completo na Minha conta", () => {
  beforeEach(() => {
    refresh.mockReset();
    lookupCep.mockReset();
    lookupCep.mockResolvedValue({ street: "Rua Barão de Jundiaí", district: "Centro", city: "Jundiaí", state: "SP" });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ...body, email: INITIAL.email, complete: true }), { status: 200 });
    }));
  });

  it("começa em pessoa física, com CPF e sem campos de empresa", () => {
    render(<AccountProfileForm initial={INITIAL} />);
    expect(screen.getByRole("radio", { name: "Pessoa física" })).toBeChecked();
    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Ana Silva");
    expect(screen.queryByLabelText("CNPJ")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Razão social")).not.toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("readonly");
  });

  it("em pessoa jurídica pede CNPJ, razão social, nome fantasia, inscrição estadual e o responsável", async () => {
    const user = userEvent.setup();
    render(<AccountProfileForm initial={INITIAL} />);
    await user.click(screen.getByRole("radio", { name: "Pessoa jurídica" }));

    expect(screen.getByLabelText("CNPJ")).toBeInTheDocument();
    expect(screen.getByLabelText("Razão social")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome fantasia/)).toBeInTheDocument();
    expect(screen.getByLabelText("Inscrição estadual")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do responsável")).toHaveValue("Ana Silva");
    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
  });

  it("formata CPF e CNPJ enquanto digita", async () => {
    const user = userEvent.setup();
    render(<AccountProfileForm initial={INITIAL} />);
    await user.type(screen.getByLabelText("CPF"), "52998224725");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");

    await user.click(screen.getByRole("radio", { name: "Pessoa jurídica" }));
    await user.type(screen.getByLabelText("CNPJ"), "11222333000181");
    expect(screen.getByLabelText("CNPJ")).toHaveValue("11.222.333/0001-81");
  });

  it("preenche o endereço pelo CEP", async () => {
    const user = userEvent.setup();
    render(<AccountProfileForm initial={INITIAL} />);
    await fillAddress(user);
    expect(lookupCep).toHaveBeenCalledWith("13201-000");
    expect(screen.getByLabelText("Bairro")).toHaveValue("Centro");
    expect(screen.getByLabelText("Cidade")).toHaveValue("Jundiaí");
    expect(screen.getByLabelText("Estado")).toHaveValue("SP");
  });

  it("'Isento' preenche e trava a inscrição estadual", async () => {
    const user = userEvent.setup();
    render(<AccountProfileForm initial={INITIAL} />);
    await user.click(screen.getByRole("radio", { name: "Pessoa jurídica" }));
    await user.click(screen.getByRole("checkbox", { name: "Isento" }));
    expect(screen.getByLabelText("Inscrição estadual")).toHaveValue("ISENTO");
    expect(screen.getByLabelText("Inscrição estadual")).toBeDisabled();
  });

  it("salva o cadastro de pessoa física", async () => {
    const user = userEvent.setup();
    render(<AccountProfileForm initial={INITIAL} />);
    await user.type(screen.getByLabelText("CPF"), "52998224725");
    await user.type(screen.getByLabelText("Telefone / WhatsApp"), "11988887777");
    await fillAddress(user);
    await user.click(screen.getByRole("button", { name: "Salvar cadastro" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Cadastro salvo"));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/account/profile");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      personType: "pf",
      name: "Ana Silva",
      document: "529.982.247-25",
      phone: "(11) 98888-7777",
      address: { cep: "13201-000", street: "Rua Barão de Jundiaí", number: "100", district: "Centro", city: "Jundiaí", state: "SP" },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("mostra o erro embaixo de cada campo que o servidor recusar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "INVALID_FIELDS", errors: { document: "CPF inválido.", number: "Informe o número (ou S/N)." },
    }), { status: 400 })));
    const user = userEvent.setup();
    render(<AccountProfileForm initial={INITIAL} />);
    await user.click(screen.getByRole("button", { name: "Salvar cadastro" }));

    const cpf = await screen.findByLabelText("CPF");
    await waitFor(() => expect(cpf).toHaveAttribute("aria-invalid", "true"));
    expect(cpf).toHaveAccessibleDescription("CPF inválido.");
    expect(screen.getByLabelText("Número")).toHaveAccessibleDescription("Informe o número (ou S/N).");
    expect(within(screen.getByRole("alert")).getByText(/Confira os campos/)).toBeInTheDocument();
  });
});
