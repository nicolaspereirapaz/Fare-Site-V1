import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildAuthOptions } from "@/lib/auth/options";

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
