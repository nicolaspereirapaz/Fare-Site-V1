import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ColorDots } from "@/components/ColorDots";
import { swatchFor } from "@/lib/colorSwatches";

describe("cores das bolinhas", () => {
  it("cada cor do fornecedor tem uma amostra própria", () => {
    expect(swatchFor("Preto")).toEqual({ background: "#1f1f22" });
    expect(swatchFor("BRANCO")).toEqual({ background: "#ffffff" });
    expect(swatchFor("Azul (tom 2)")).toEqual({ background: "#2457c5" });
    expect(swatchFor("Inox").background).toContain("linear-gradient");
    expect(swatchFor("Colorido").background).toContain("conic-gradient");
  });

  it("variação de duas cores vira bolinha meio a meio", () => {
    expect(swatchFor("Azul / Branco")).toEqual({ background: "linear-gradient(135deg, #2457c5 50%, #ffffff 50%)" });
  });

  it("cor desconhecida usa um cinza neutro", () => {
    expect(swatchFor("Furta-cor")).toEqual({ background: "#c9c6c1" });
  });
});

describe("bolinhas de cor no card", () => {
  const COLORS = ["Preto", "Azul", "Branco", "Verde", "Vermelho", "Rosa", "Cinza", "Prata", "Laranja"];

  it("mostra uma bolinha por cor, com o nome para quem usa leitor de tela", () => {
    render(<ColorDots colors={COLORS.slice(0, 3)} />);

    const list = screen.getByRole("list", { name: "3 cores disponíveis" });
    expect(list.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByTitle("Preto")).toBeInTheDocument();
    expect(screen.getByTitle("Branco")).toBeInTheDocument();
  });

  it("acima do limite mostra '+N'", () => {
    render(<ColorDots colors={COLORS} max={6} />);

    expect(screen.getByRole("list", { name: "9 cores disponíveis" }).querySelectorAll("li .color-dot")).toHaveLength(6);
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("sem cores não mostra nada", () => {
    const { container } = render(<ColorDots colors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
