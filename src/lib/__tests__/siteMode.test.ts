import { describe, expect, it } from "vitest";
import { campaignGate, isCampaignOnlyMode } from "@/lib/siteMode";

describe("isolamento da campanha Outubro Rosa", () => {
  it("libera só as páginas e a API da campanha, além dos arquivos estáticos", () => {
    for (const path of [
      "/campanhas/outubro-rosa",
      "/campanhas/outubro-rosa/cf93a396fd138947",
      "/api/campaigns/outubro-rosa/products",
      "/api/campaigns/outubro-rosa/products/cf93a396fd138947",
      "/_next/static/chunks/app.js",
      "/images/fare-foto-logo.svg",
      "/favicon.ico",
    ]) {
      expect(campaignGate(path), path).toBe("allow");
    }
  });

  it("redireciona as outras páginas do site para a campanha", () => {
    for (const path of ["/", "/entrar", "/cadastro", "/minha-conta", "/carrinho", "/produtos", "/produtos/revelacao-de-fotos", "/brindes", "/backoffice", "/campanhas", "/campanhas/outubro-rosa-falsa"]) {
      expect(campaignGate(path), path).toBe("redirect");
    }
  });

  it("bloqueia as outras APIs (login, conta, catálogo geral, backoffice)", () => {
    for (const path of ["/api/auth/sign-in/email", "/api/auth/get-session", "/api/xbz/products", "/api/backoffice/orders", "/api/campaigns/outro"]) {
      expect(campaignGate(path), path).toBe("not-found");
    }
  });

  it("só volta ao site completo com FARE_FULL_SITE=1", () => {
    expect(isCampaignOnlyMode({})).toBe(true);
    expect(isCampaignOnlyMode({ FARE_FULL_SITE: "0" })).toBe(true);
    expect(isCampaignOnlyMode({ FARE_FULL_SITE: "1" })).toBe(false);
  });
});
