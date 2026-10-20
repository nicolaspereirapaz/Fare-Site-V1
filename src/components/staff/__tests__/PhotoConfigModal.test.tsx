import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhotoConfigModal } from "@/components/staff/PhotoConfigModal";
import { photoFromName, photoItemName, photoTablePrice } from "@/components/staff/photoItems";

/* Foto no orçamento/pedido da equipe: preço da tabela do site, editável; reconhecida pelo nome ao reabrir. */
describe("foto no orçamento da equipe", () => {
  it("nome padrão vai e volta (o servidor guarda só o nome)", () => {
    const name = photoItemName({ sizeId: "10x15" });
    expect(name).toBe("Revelação 10 × 15 cm");
    expect(photoFromName(name)).toEqual({ sizeId: "10x15" });
    expect(photoFromName("Banner lona 90 × 120 cm")).toBeNull();
  });

  it("preço da tabela segue a quantidade", () => {
    expect(photoTablePrice("10x15", 1)).toBe(6);
    expect(photoTablePrice("10x15", 20)).toBe(3);
    expect(photoTablePrice("20x30", 11)).toBe(10);
  });

  it("quantidade e tamanho; custo zero e preço da tabela; a equipe pode trocar o preço; sem papel", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PhotoConfigModal onClose={vi.fn()} onSave={onSave} start={{ sizeId: "10x15" }} />);
    expect(screen.queryByRole("radio", { name: "Fosco" })).not.toBeInTheDocument();
    const copies = screen.getByLabelText("Quantidade de fotos");
    await user.clear(copies);
    await user.type(copies, "20");
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({
      source: "avulso", name: "Revelação 10 × 15 cm", cost: 0, quantity: 20, gravacoes: [], priceOverride: "3,00",
    }));

    const price = screen.getByLabelText("Preço por foto");
    await user.clear(price);
    await user.type(price, "2,50");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ priceOverride: "2,50" }));
  });

  it("tamanho digitado: nome vai e volta e o preço segue a regra do site", async () => {
    expect(photoFromName("Revelação 11 × 16 cm")).toEqual({ sizeId: "rev-11x16" });
    expect(photoFromName("Ampliação 20,5 × 28 cm · papel Fosco")).toEqual({ sizeId: "amp-20.5x28", paper: "fosco" });
    expect(photoItemName({ sizeId: "amp-20.5x28", paper: "fosco" })).toBe("Ampliação 20,5 × 28 cm · papel Fosco");
    expect(photoFromName("Revelação 50 × 70 cm")).toBeNull(); // não cabe em revelação

    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PhotoConfigModal onClose={vi.fn()} onSave={onSave} start={{ sizeId: "10x15" }} />);
    await user.type(screen.getByLabelText("Largura em cm"), "11");
    await user.type(screen.getByLabelText("Altura em cm"), "16");
    await user.click(screen.getByRole("button", { name: "Usar" }));
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));
    // cabe em 13 × 18 (1 foto: 9,00) + 1,00
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Revelação 11 × 16 cm", quantity: 1, priceOverride: "10,00" }));
  });
});

describe("foto no documento do cliente", () => {
  it("mesmo modelo do brinde: etiquetas Papel e Cópias, descrição e medidas", async () => {
    const { photoDocumentLines } = await import("@/components/staff/photoItems");
    expect(photoDocumentLines({ productName: "Revelação 10 × 15 cm · papel Fosco" })).toEqual({
      name: "Revelação de Fotos",
      color: "Papel Fosco",
      unitLabel: { one: "Cópia", many: "Cópias" },
      description: expect.stringMatching(/^Revelação de fotos em processo químico, com papel fotográfico Fujifilm de alta durabilidade/),
      specs: ["10x15cm", "Tamanho real: 10,2x15,2cm"],
    });
    expect(photoDocumentLines({ productName: "Revelação 10 × 15 cm" })?.color).toBeNull();
    expect(photoDocumentLines({ productName: "Caneca personalizada" })).toBeNull();
  });
});
