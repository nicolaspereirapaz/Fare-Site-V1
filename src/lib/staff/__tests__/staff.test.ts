// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { buildStaffAuthOptions, STAFF_AUTH_BASE_PATH, STAFF_COOKIE_PREFIX } from "@/lib/staff/options";
import {
  inviteStaffMember,
  isStaffInviteValid,
  listStaffMembers,
  migrateStaffDatabase,
  removeStaffMember,
  STAFF_INVITE_HOURS,
} from "@/lib/staff/members";

const NOW = new Date("2026-10-09T12:00:00.000Z");

function staffAuthFor(db: DatabaseSync) {
  return betterAuth({
    ...buildStaffAuthOptions(db, { NODE_ENV: "development" }),
    secret: "segredo-de-teste-com-pelo-menos-32-caracteres!!",
    baseURL: "http://localhost:3000",
  });
}

describe("contas da equipe (banco separado)", () => {
  it("cria as tabelas do zero e pode rodar de novo sem erro", () => {
    const db = new DatabaseSync(":memory:");
    migrateStaffDatabase(db);
    migrateStaffDatabase(db);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["user", "session", "account", "verification"]));
  });

  it("convida: cria a pessoa com o papel e gera um link de 1 uso que vale 48 h", () => {
    const db = new DatabaseSync(":memory:");
    const invite = inviteStaffMember(db, { name: "Joana Lima", email: "  Joana@FareFoto.com.br ", role: "vendedor" }, NOW);

    expect(invite.created).toBe(true);
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(invite.expiresAt.toISOString()).toBe(new Date(NOW.getTime() + STAFF_INVITE_HOURS * 3600_000).toISOString());
    expect(STAFF_INVITE_HOURS).toBe(48);
    expect(listStaffMembers(db)).toEqual([{ name: "Joana Lima", email: "joana@farefoto.com.br", role: "vendedor", hasPassword: false }]);
  });

  it("convidar de novo a mesma pessoa atualiza nome/papel e invalida o convite anterior", () => {
    const db = new DatabaseSync(":memory:");
    const first = inviteStaffMember(db, { name: "Joana", email: "joana@farefoto.com.br", role: "vendedor" }, NOW);
    const second = inviteStaffMember(db, { name: "Joana Lima", email: "joana@farefoto.com.br", role: "admin" }, NOW);

    expect(second.created).toBe(false);
    expect(listStaffMembers(db)).toEqual([expect.objectContaining({ name: "Joana Lima", role: "admin" })]);
    const tokens = (db.prepare("SELECT identifier FROM verification").all() as Array<{ identifier: string }>).map((v) => v.identifier);
    expect(tokens).toEqual([`reset-password:${second.token}`]);
    expect(tokens).not.toContain(`reset-password:${first.token}`);
  });

  it("recusa papel desconhecido e e-mail inválido", () => {
    const db = new DatabaseSync(":memory:");
    expect(() => inviteStaffMember(db, { name: "Xavier", email: "x@farefoto.com.br", role: "cliente" as never }, NOW)).toThrow(/papel/i);
    expect(() => inviteStaffMember(db, { name: "Xavier", email: "sem-arroba", role: "admin" }, NOW)).toThrow(/e-mail/i);
    expect(() => inviteStaffMember(db, { name: " ", email: "x@farefoto.com.br", role: "admin" }, NOW)).toThrow(/nome/i);
  });

  it("sabe se o convite ainda vale (antes de usar, depois de vencer e se não existir)", () => {
    const db = new DatabaseSync(":memory:");
    const invite = inviteStaffMember(db, { name: "Joana", email: "joana@farefoto.com.br", role: "vendedor" }, NOW);
    expect(isStaffInviteValid(db, invite.token, NOW)).toBe(true);
    expect(isStaffInviteValid(db, invite.token, new Date(NOW.getTime() + 49 * 3600_000))).toBe(false);
    expect(isStaffInviteValid(db, "nao-existe", NOW)).toBe(false);
  });

  it("remover tira a pessoa, as sessões e os convites", () => {
    const db = new DatabaseSync(":memory:");
    inviteStaffMember(db, { name: "Joana", email: "joana@farefoto.com.br", role: "vendedor" }, NOW);
    expect(removeStaffMember(db, "JOANA@farefoto.com.br")).toBe(true);
    expect(listStaffMembers(db)).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM verification").get()).toEqual({ n: 0 });
    expect(removeStaffMember(db, "ninguem@farefoto.com.br")).toBe(false);
  });
});

describe("login da equipe", () => {
  it("é separado do site: outro endereço e outro cookie", () => {
    const options = buildStaffAuthOptions(new DatabaseSync(":memory:"), { NODE_ENV: "development" });
    expect(STAFF_AUTH_BASE_PATH).toBe("/api/equipe/auth");
    expect(options.basePath).toBe(STAFF_AUTH_BASE_PATH);
    expect(options.advanced?.cookiePrefix).toBe(STAFF_COOKIE_PREFIX);
    expect(STAFF_COOKIE_PREFIX).not.toBe("better-auth");
  });

  it("ninguém consegue se cadastrar sozinho", async () => {
    const db = new DatabaseSync(":memory:");
    migrateStaffDatabase(db);
    await expect(staffAuthFor(db).api.signUpEmail({ body: { name: "Intruso", email: "intruso@x.com", password: "SenhaForte!2026" } }))
      .rejects.toThrow();
    expect(listStaffMembers(db)).toEqual([]);
  });

  it("convite → criar senha pelo link → entrar; o link não funciona duas vezes", async () => {
    const db = new DatabaseSync(":memory:");
    const invite = inviteStaffMember(db, { name: "Joana", email: "joana@farefoto.com.br", role: "admin" }, new Date());
    const auth = staffAuthFor(db);

    await auth.api.resetPassword({ body: { token: invite.token, newPassword: "SenhaDaEquipe!2026" } });
    expect(listStaffMembers(db)[0].hasPassword).toBe(true);

    const signed = await auth.api.signInEmail({ body: { email: "joana@farefoto.com.br", password: "SenhaDaEquipe!2026" } });
    expect(signed.user).toMatchObject({ email: "joana@farefoto.com.br", role: "admin" });

    await expect(auth.api.resetPassword({ body: { token: invite.token, newPassword: "OutraSenha!2026" } })).rejects.toThrow();
    await expect(auth.api.signInEmail({ body: { email: "joana@farefoto.com.br", password: "errada-123456" } })).rejects.toThrow();
  });

  it("senha da equipe precisa de pelo menos 10 caracteres", async () => {
    const db = new DatabaseSync(":memory:");
    const invite = inviteStaffMember(db, { name: "Joana", email: "joana@farefoto.com.br", role: "admin" }, new Date());
    await expect(staffAuthFor(db).api.resetPassword({ body: { token: invite.token, newPassword: "curta123" } })).rejects.toThrow();
  });
});
