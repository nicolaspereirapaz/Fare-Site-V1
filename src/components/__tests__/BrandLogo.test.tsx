import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { CartProvider } from "@/context/CartContext";

const srcOf = (element: Element) => decodeURIComponent(element.getAttribute("src") ?? "");

describe("logo do site", () => {
  it("no topo (fundo branco): logo com o slogan em preto; no celular, a versão compacta", () => {
    render(
      <CartProvider>
        <Header user={null} />
      </CartProvider>,
    );
    const images = [...screen.getByRole("link", { name: "Fare Foto — início" }).querySelectorAll("img")];

    expect(images.map(srcOf)).toEqual([
      expect.stringContaining("/images/fare-foto-logo-slogan.svg"),
      expect.stringContaining("/images/fare-foto-logo-compacto.svg"),
    ]);
    expect(images[0]).toHaveClass("brand-logo-full");
    expect(images[1]).toHaveClass("brand-logo-compact");
  });

  it("no rodapé (fundo azul): opção A, círculo laranja e letras brancas, sem filtro", () => {
    render(<Footer />);
    const logo = screen.getByAltText("Fare Foto");

    expect(srcOf(logo)).toContain("/images/fare-foto-logo-escuro.svg");
  });
});
