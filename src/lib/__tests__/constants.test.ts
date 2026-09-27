import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl } from "../commerce";
import { FARE_FOTO_WHATSAPP } from "../constants";

describe("FARE_FOTO_WHATSAPP", () => {
  it("é o telefone oficial da Fare Foto usado como constante central", () => {
    expect(FARE_FOTO_WHATSAPP).toBe("5511977843872");
  });

  it("gera uma URL de WhatsApp válida a partir da constante central", () => {
    const url = buildWhatsAppUrl(FARE_FOTO_WHATSAPP, "Olá!");

    expect(url).toBe("https://wa.me/5511977843872?text=Ol%C3%A1!");
  });
});
