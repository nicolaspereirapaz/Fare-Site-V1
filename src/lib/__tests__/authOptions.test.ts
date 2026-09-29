import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildAuthOptions, resolveTrustedOrigins } from "@/lib/auth/options";

describe("configuração do Better Auth", () => {
  it("habilita e-mail/senha e cria novos usuários como cliente", () => {
    const database = new DatabaseSync(":memory:");
    const options = buildAuthOptions(database);

    expect(options.database).toBe(database);
    expect(options.emailAndPassword).toMatchObject({ enabled: true });
    expect(options.user?.additionalFields?.role).toMatchObject({
      type: "string",
      required: false,
      defaultValue: "cliente",
      input: false,
    });

    database.close();
  });
});

describe("origens confiáveis do login", () => {
  it("aceita localhost e 127.0.0.1 na porta do dev e a rede local em desenvolvimento", () => {
    const origins = resolveTrustedOrigins({ NODE_ENV: "development", PORT: "3000" });
    expect(origins).toEqual(expect.arrayContaining([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://192.168.*.*:3000",
    ]));
  });

  it("usa 3000 quando PORT não está definido", () => {
    expect(resolveTrustedOrigins({ NODE_ENV: "development" })).toContain("http://localhost:3000");
  });

  it("inclui origens extras de BETTER_AUTH_TRUSTED_ORIGINS (separadas por vírgula, sem espaços)", () => {
    const origins = resolveTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_TRUSTED_ORIGINS: " https://www.farefoto.com.br , https://farefoto.com.br ,",
    });
    expect(origins).toEqual(["https://www.farefoto.com.br", "https://farefoto.com.br"]);
  });

  it("em produção não libera localhost nem a rede local", () => {
    const origins = resolveTrustedOrigins({ NODE_ENV: "production", PORT: "3000" });
    expect(origins.some((origin) => origin.includes("localhost") || origin.includes("192.168"))).toBe(false);
  });

  it("é aplicado nas opções do Better Auth", () => {
    const database = new DatabaseSync(":memory:");
    const options = buildAuthOptions(database, { NODE_ENV: "development", PORT: "3000" });
    expect(options.trustedOrigins).toContain("http://localhost:3000");
    database.close();
  });
});
