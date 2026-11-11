import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GraficaConfigModal } from "@/components/staff/GraficaConfigModal";
import { graficaFromName, graficaItemName, graficaUnitPrice } from "@/components/staff/graficaItems";

describe("gráfica por m² (R$ 140,00 o m², mínimo R$ 30,00 no item)", () => {
  it("preço por peça = área × 140, sempre arredondado para cima no real inteiro", () => {
    expect(graficaUnitPrice(100, 60, 1)).toEqual({ unit: 84, minimum: false }); // 0,6 m² = 84,00 exato
    expect(graficaUnitPrice(90, 120, 2)).toEqual({ unit: 152, minimum: false }); // 1,08 m² = 151,20
    expect(graficaUnitPrice(33.3, 33.3, 3)).toEqual({ unit: 16, minimum: false }); // 0,110889 m² = 15,52
    expect(graficaUnitPrice(150, 80, 1)).toEqual({ unit: 168, minimum: false }); // 1,2 m² = 168,00 exato
  });

  it("item abaixo de R$ 30,00: o valor por peça sobe (real inteiro) até fechar o mínimo", () => {
    expect(graficaUnitPrice(20, 20, 1)).toEqual({ unit: 30, minimum: true }); // 5,60 sozinho
    expect(graficaUnitPrice(10, 10, 7)).toEqual({ unit: 5, minimum: true }); // 7 × 5,00 = 35,00
    expect(graficaUnitPrice(30, 30, 3)).toEqual({ unit: 13, minimum: false }); // 12,60 → 13,00; 3 × 13 = 39,00
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
});
