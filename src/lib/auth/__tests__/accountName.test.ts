// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { migrateStaffDatabase } from "@/lib/staff/members";
import { buildAuthOptions } from "@/lib/auth/options";
import { shortPersonName } from "@/lib/text/names";

const noMail = { send: async () => undefined };

describe("nome da conta do site", () => {
  it("cria e edita a conta já com o nome formatado", async () => {
    const db = new DatabaseSync(":memory:");
    const options = { ...buildAuthOptions(db, { NODE_ENV: "development" }, noMail as never), secret: "segredo-de-teste-com-pelo-menos-32-caracteres!!", baseURL: "http://localhost:3000" };
    migrateStaffDatabase(db); // mesmas tabelas user/session/account/verification do Better Auth
    const auth = betterAuth(options);
    const created = await auth.api.signUpEmail({ body: { name: "  carlos vinicius ALVES da cruz barbosa ", email: "carlos@x.com", password: "SenhaForte!2026" } });
    expect(created.user.name).toBe("Carlos Vinicius Alves da Cruz Barbosa");
    const row = db.prepare("SELECT name FROM user WHERE email = ?").get("carlos@x.com") as { name: string };
    expect(row.name).toBe("Carlos Vinicius Alves da Cruz Barbosa");
    const hooks = options.databaseHooks!.user!.update!.before!;
    expect(await hooks({ name: "MARIA DE LOURDES" }, null)).toEqual({ data: { name: "Maria de Lourdes" } });
    expect(await hooks({ image: "x" }, null)).toBeUndefined();
  });

  it("nome curto da comanda", () => {
    expect(shortPersonName("Carlos Vinicius Alves da Cruz Barbosa")).toBe("Carlos Barbosa");
    expect(shortPersonName("joão dos santos")).toBe("João Santos");
    expect(shortPersonName("Ana")).toBe("Ana");
  });
});
