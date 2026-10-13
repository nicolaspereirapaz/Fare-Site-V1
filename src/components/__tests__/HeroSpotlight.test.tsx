import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroSpotlight, SPOTLIGHT_INTERVAL_MS, type SpotlightProduct } from "@/components/HeroSpotlight";

const PRODUCTS: SpotlightProduct[] = [
  { id: "1", name: "Garrafa Térmica Inox", category: "Garrafas e Squeezes", imageUrl: "https://img/1.jpg", href: "/brindes/aaa" },
  { id: "2", name: "Mochila de Nylon", category: "Mochilas", imageUrl: "https://img/2.jpg", href: "/brindes/bbb" },
  { id: "3", name: "Kit Executivo", category: "Kits Executivos", imageUrl: "https://img/3.jpg", href: "/brindes/ccc" },
];

function renderHero(products = PRODUCTS) {
  return render(
    <HeroSpotlight badge="3.000+" products={products} totalLabel="Mais de 3.000 opções" whatsAppUrl="https://wa.me/5511953147703" />,
  );
}

describe("banner da Home (holofote)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mostra o título, os botões e o 1º produto em destaque", () => {
    renderHero();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sua marca em brindes que circulam.");
    expect(screen.getByText(/Mais de 3\.000 opções/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver brindes/ })).toHaveAttribute("href", "/brindes");
    expect(screen.getByRole("link", { name: /Falar com a equipe/ })).toHaveAttribute("href", "https://wa.me/5511953147703");
    expect(screen.getByRole("status")).toHaveTextContent("Garrafas e Squeezes");
    expect(screen.getByRole("link", { name: "Ver Garrafa Térmica Inox" })).toHaveAttribute("href", "/brindes/aaa");
    expect(screen.getByText("3.000+")).toBeInTheDocument();
  });

  it("clicar numa miniatura coloca aquele produto no holofote", () => {
    renderHero();

    fireEvent.click(screen.getByRole("button", { name: "Kit Executivo" }));

    expect(screen.getByRole("status")).toHaveTextContent("Kits Executivos");
    expect(screen.getByRole("button", { name: "Kit Executivo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Garrafa Térmica Inox" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("link", { name: "Ver Kit Executivo" })).toHaveAttribute("href", "/brindes/ccc");
  });

  it("troca sozinho de produto e volta ao início no fim da lista", () => {
    vi.useFakeTimers();
    renderHero();

    act(() => vi.advanceTimersByTime(SPOTLIGHT_INTERVAL_MS));
    expect(screen.getByRole("status")).toHaveTextContent("Mochilas");
    act(() => vi.advanceTimersByTime(SPOTLIGHT_INTERVAL_MS));
    expect(screen.getByRole("status")).toHaveTextContent("Kits Executivos");
    act(() => vi.advanceTimersByTime(SPOTLIGHT_INTERVAL_MS));
    expect(screen.getByRole("status")).toHaveTextContent("Garrafas e Squeezes");
  });

  it("quem pediu menos movimento no aparelho vê o banner parado", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    renderHero();

    act(() => vi.advanceTimersByTime(SPOTLIGHT_INTERVAL_MS * 3));
    expect(screen.getByRole("status")).toHaveTextContent("Garrafas e Squeezes");
  });

  it("sem produtos (catálogo fora do ar) o banner abre só com o texto", () => {
    renderHero([]);

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
