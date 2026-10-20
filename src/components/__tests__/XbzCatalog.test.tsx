import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XbzCatalog, XbzProductCard } from "@/components/XbzCatalog";

// Parâmetros da URL vistos pelo catálogo; null = fora do roteador (usa a categoria inicial).
const navigation = vi.hoisted(() => ({ params: null as URLSearchParams | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => navigation.params }));

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe("catálogo de brindes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    navigation.params = null;
  });

  it("abre já filtrado pela categoria escolhida na Home", async () => {
    const fetchMock = vi.fn(async () => json({
      products: [],
      categories: [{ name: "Canecas", count: 3 }, { name: "Garrafas", count: 2 }],
      pricesVisible: false,
      meta: { total: 0, page: 1, limit: 24, fetchedAt: "2026-10-10T00:00:00.000Z", cached: true },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<XbzCatalog initialCategory="Canecas" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const firstUrl = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(new URL(firstUrl, "http://x").searchParams.get("categoria")).toBe("Canecas");
    expect(await screen.findByRole("radio", { name: /Canecas/ })).toBeChecked();
  });

  it("troca de categoria quando a URL muda (menu Brindes com a página já aberta)", async () => {
    const fetchMock = vi.fn(async () => json({
      products: [],
      categories: [{ name: "Mochilas", count: 3 }, { name: "Pet", count: 2 }],
      pricesVisible: false,
      meta: { total: 0, page: 1, limit: 24, fetchedAt: "2026-10-10T00:00:00.000Z", cached: true },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const lastCategory = () => new URL(String((fetchMock.mock.calls.at(-1) as unknown[])[0]), "http://x").searchParams.get("categoria");

    navigation.params = new URLSearchParams("categoria=Mochilas");
    const { rerender } = render(<XbzCatalog initialCategory="Mochilas" />);
    await waitFor(() => expect(lastCategory()).toBe("Mochilas"));

    navigation.params = new URLSearchParams("categoria=Pet");
    rerender(<XbzCatalog initialCategory="Pet" />);
    await waitFor(() => expect(lastCategory()).toBe("Pet"));
    expect(await screen.findByRole("radio", { name: /Pet/ })).toBeChecked();
  });

  it("escolher uma categoria na lateral atualiza a URL", async () => {
    const { fetchMock, lastParams } = mockCatalog(false);
    navigation.params = new URLSearchParams();
    render(<XbzCatalog />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("radio", { name: /Canecas/ }));

    await waitFor(() => expect(lastParams().get("categoria")).toBe("Canecas"));
    expect(new URL(window.location.href).searchParams.get("categoria")).toBe("Canecas");
    window.history.replaceState(null, "", "/");
  });

  it("o card mostra o código Fare Foto só quando ele vem (cliente cadastrado)", () => {
    const product = {
      publicId: "abc", name: "CANECA ACRÍLICA", description: "", imageUrl: "/c.jpg", category: "Canecas",
      subcategory: "", colors: ["AZUL"], variants: [],
    };
    const { rerender } = render(<XbzProductCard pricesVisible={false} product={product} />);
    expect(screen.queryByText(/Cód\./)).not.toBeInTheDocument();

    rerender(<XbzProductCard pricesVisible product={{ ...product, code: "X10001" }} />);
    expect(screen.getByText("Cód. X10001")).toBeInTheDocument();
  });

  function mockCatalog(pricesVisible: boolean) {
    const fetchMock = vi.fn(async () => json({
      products: [], categories: [{ name: "Canecas", count: 3 }], pricesVisible,
      meta: { total: 0, page: 1, limit: 24, fetchedAt: "2026-10-10T00:00:00.000Z", cached: true },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const lastParams = () => new URL(String((fetchMock.mock.calls.at(-1) as unknown[])[0]), "http://x").searchParams;
    return { fetchMock, lastParams };
  }

  it("filtra por quantidade (estoque) e ordena por menor preço", async () => {
    const { fetchMock, lastParams } = mockCatalog(true);
    render(<XbzCatalog />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(lastParams().get("qtd")).toBe("500"));

    fireEvent.change(await screen.findByLabelText("Ordenar por"), { target: { value: "menor-preco" } });
    await waitFor(() => expect(lastParams().get("ordem")).toBe("menor-preco"));
    expect(lastParams().get("qtd")).toBe("500");
  });

  it("cliente cadastrado filtra por faixa de preço por unidade", async () => {
    const { fetchMock, lastParams } = mockCatalog(true);
    render(<XbzCatalog />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(await screen.findByLabelText("Preço mínimo por unidade"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Preço máximo por unidade"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(lastParams().get("precoMax")).toBe("10"));
    expect(lastParams().get("precoMin")).toBe("2");
  });

  it("visitante não vê filtro nem ordem por preço", async () => {
    const { fetchMock } = mockCatalog(false);
    render(<XbzCatalog />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await screen.findByLabelText("Ordenar por");

    expect(screen.queryByLabelText("Preço mínimo por unidade")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Menor preço" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mais relevantes" })).toBeInTheDocument();
  });
});
