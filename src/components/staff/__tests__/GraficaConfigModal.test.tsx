import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GraficaConfigModal } from "@/components/staff/GraficaConfigModal";
import { graficaFromName, graficaImage, graficaItemName, graficaUnitPrice } from "@/components/staff/graficaItems";

describe("gráfica por m² (banner/adesivo: R$ 140,00 o m², mínimo R$ 30,00; vinil de recorte: R$ 160,00, mínimo R$ 25,00)", () => {
  it("preço por peça = área × 140, sempre arredondado para cima no real inteiro", () => {
    expect(graficaUnitPrice("banner-lona", 100, 60, 1)).toEqual({ unit: 84, minimum: false }); // 0,6 m² = 84,00 exato
    expect(graficaUnitPrice("banner-lona", 90, 120, 2)).toEqual({ unit: 152, minimum: false }); // 1,08 m² = 151,20
    expect(graficaUnitPrice("adesivo-vinil", 33.3, 33.3, 3)).toEqual({ unit: 16, minimum: false }); // 0,110889 m² = 15,52
    expect(graficaUnitPrice("adesivo-vinil", 150, 80, 1)).toEqual({ unit: 168, minimum: false }); // 1,2 m² = 168,00 exato
  });

  it("item abaixo de R$ 30,00: o valor por peça sobe (real inteiro) até fechar o mínimo", () => {
    expect(graficaUnitPrice("banner-lona", 20, 20, 1)).toEqual({ unit: 30, minimum: true }); // 5,60 sozinho
    expect(graficaUnitPrice("banner-lona", 10, 10, 7)).toEqual({ unit: 5, minimum: true }); // 7 × 5,00 = 35,00
    expect(graficaUnitPrice("banner-lona", 30, 30, 3)).toEqual({ unit: 13, minimum: false }); // 12,60 → 13,00; 3 × 13 = 39,00
  });

  it("vinil de recorte: área × 160 e mínimo de R$ 25,00", () => {
    expect(graficaUnitPrice("vinil-recorte", 100, 60, 1)).toEqual({ unit: 96, minimum: false }); // 0,6 m² = 96,00 exato
    expect(graficaUnitPrice("vinil-recorte", 33.3, 33.3, 3)).toEqual({ unit: 18, minimum: false }); // 17,74 → 18,00; 3 × 18 = 54,00
    expect(graficaUnitPrice("vinil-recorte", 20, 20, 1)).toEqual({ unit: 25, minimum: true }); // 6,40 sozinho
    expect(graficaUnitPrice("vinil-recorte", 10, 10, 7)).toEqual({ unit: 4, minimum: true }); // 1,60 → 2,00; 7 × 2 = 14 → 25/7 = 3,57 → 4,00
  });

  it("vinil de recorte: a cor entra no nome e na foto; sem cor não é reconhecido", () => {
    const name = graficaItemName({ id: "vinil-recorte", color: "Preto Brilho", width: 100, height: 60 });
    expect(name).toBe("Vinil Adesivo Recorte Eletrônico Preto Brilho 100 × 60 cm");
    expect(graficaFromName(name)).toEqual({ id: "vinil-recorte", color: "Preto Brilho", width: 100, height: 60 });
    expect(graficaImage({ id: "vinil-recorte", color: "Preto Brilho" })).toBe("/images/grafica/10-vinil-recorte-preto-brilho.webp");
    expect(graficaFromName("Vinil Adesivo Recorte Eletrônico 100 × 60 cm")).toBeNull();
    expect(graficaFromName("Vinil Adesivo Recorte Eletrônico Azul 100 × 60 cm")).toBeNull();
  });

  it("nome padrão volta para as medidas (para editar de novo); nome diferente não é gráfica", () => {
    const name = graficaItemName({ id: "adesivo-vinil", width: 50.5, height: 30 });
    expect(name).toBe("Adesivo Vinil 50,5 × 30 cm");
    expect(graficaFromName(name)).toEqual({ id: "adesivo-vinil", width: 50.5, height: 30 });
    expect(graficaFromName("Banner lona 100 × 60 cm")).toBeNull();
    expect(graficaFromName("Revelação 10 × 15 cm")).toBeNull();
  });
});

describe("janela de configuração da gráfica", () => {
  it("digita largura e altura em cm, mostra área e preço, e adiciona com o nome e o preço gravados", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<GraficaConfigModal onClose={vi.fn()} onSave={onSave} start={{ id: "banner-lona", width: 0, height: 0 }} />);
    expect(screen.getByRole("button", { name: /Adicionar/ })).toBeDisabled();
    await user.type(screen.getByLabelText("Largura (cm)"), "100");
    await user.type(screen.getByLabelText("Altura (cm)"), "60");
    await user.clear(screen.getByLabelText("Quantidade"));
    await user.type(screen.getByLabelText("Quantidade"), "2");
    expect(screen.getByText("1,2 m²")).toBeInTheDocument();
    expect(screen.getByLabelText("Preço por peça")).toHaveValue("84,00");
    await user.click(screen.getByRole("radio", { name: "Adesivo Vinil" }));
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ source: "avulso", name: "Adesivo Vinil 100 × 60 cm", quantity: 2, cost: 0, priceOverride: "84,00" }));
  });

  it("pequeno demais: aplica o pedido mínimo e avisa", async () => {
    const user = userEvent.setup();
    render(<GraficaConfigModal onClose={vi.fn()} onSave={vi.fn()} start={{ id: "adesivo-vinil", width: 0, height: 0 }} />);
    await user.type(screen.getByLabelText("Largura (cm)"), "10");
    await user.type(screen.getByLabelText("Altura (cm)"), "10");
    expect(screen.getByLabelText("Preço por peça")).toHaveValue("30,00");
    expect(screen.getByText(/Abaixo do mínimo/)).toBeInTheDocument();
  });

  it("troca para o vinil de recorte: escolhe a cor e o preço recalcula com R$ 160,00 o m²", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<GraficaConfigModal onClose={vi.fn()} onSave={onSave} start={{ id: "banner-lona", width: 100, height: 60 }} />);
    expect(screen.getByLabelText("Preço por peça")).toHaveValue("84,00");
    expect(screen.queryByRole("radiogroup", { name: "Cor" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Vinil Adesivo Recorte Eletrônico" }));
    expect(screen.getByLabelText("Preço por peça")).toHaveValue("96,00");
    expect(screen.getByRole("radio", { name: "Branco Brilho" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Preto Brilho" }));
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Vinil Adesivo Recorte Eletrônico Preto Brilho 100 × 60 cm", priceOverride: "96,00" }));
  });

  it("editar vinil de recorte já na lista: abre com a cor salva", () => {
    render(<GraficaConfigModal onClose={vi.fn()} onSave={vi.fn()} start={{ id: "vinil-recorte", color: "Preto Brilho", width: 50, height: 50 }} />);
    expect(screen.getByRole("radio", { name: "Preto Brilho" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("img", { name: "Vinil Adesivo Recorte Eletrônico" })).toHaveAttribute("src", "/images/grafica/10-vinil-recorte-preto-brilho.webp");
  });
});
