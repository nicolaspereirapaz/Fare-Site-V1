import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  accountQuoteOwners,
  createPanelCustomer,
  DuplicateCustomerError,
  findCustomerDuplicates,
  normalizeEmail,
  normalizeDocument,
  normalizePhone,
  resolveCustomer,
  searchCustomers,
} from "@/lib/customers/repository";

let db: DatabaseSync;

function siteAccount(id: string, name: string, email: string, profile: { phone?: string; document?: string; company?: string } = {}) {
  db.prepare(`INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES (?, ?, ?, 1, '2026-10-01', '2026-10-01', 'cliente')`).run(id, name, email);
  db.prepare(`INSERT INTO fare_customer_profiles (user_id, updated_at, phone, document, company_name, person_type) VALUES (?, '2026-10-01', ?, ?, ?, ?)`)
    .run(id, profile.phone ?? "", profile.document ?? "", profile.company ?? "", profile.document && profile.document.length > 14 ? "pj" : "pf");
}

const actor = { id: "staff-1", name: "Bia" };

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL, image TEXT, createdAt DATE NOT NULL, updatedAt DATE NOT NULL, role TEXT)`);
  db.exec(`CREATE TABLE fare_customer_profiles (user_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, person_type TEXT NOT NULL DEFAULT 'pf', document TEXT NOT NULL DEFAULT '', company_name TEXT NOT NULL DEFAULT '', trade_name TEXT NOT NULL DEFAULT '', state_registration TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', cep TEXT NOT NULL DEFAULT '', street TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '', complement TEXT NOT NULL DEFAULT '', district TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '')`);
  siteAccount("u1", "Ana Souza", "Ana@PadariaBoaVista.com.br", { phone: "(11) 98888-7777", document: "11.222.333/0001-81", company: "Padaria Boa Vista Ltda" });
  siteAccount("u2", "Paula Ramos", "paula@gmail.com", { phone: "(19) 3333-4444", document: "529.982.247-25" });
});

describe("normalização usada para achar duplicados", () => {
  it("telefone: só dígitos, sem o 55 do país", () => {
    expect(normalizePhone("(11) 98888-7777")).toBe("11988887777");
    expect(normalizePhone("+55 11 98888-7777")).toBe("11988887777");
    expect(normalizePhone("5511988887777")).toBe("11988887777");
  });
  it("e-mail em minúsculas, sem espaços; CPF/CNPJ sem pontuação", () => {
    expect(normalizeEmail("  Ana@PadariaBoaVista.com.BR ")).toBe("ana@padariaboavista.com.br");
    expect(normalizeDocument("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeDocument("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });
});

describe("busca de clientes", () => {
  it("sem nenhuma letra digitada não lista ninguém", () => {
    expect(searchCustomers(db, "")).toEqual([]);
    expect(searchCustomers(db, "   ")).toEqual([]);
  });

  it("acha por nome, empresa (sem acento) e e-mail", () => {
    expect(searchCustomers(db, "pad").map((c) => c.name)).toEqual(["Ana Souza"]);
    expect(searchCustomers(db, "padaria boa").map((c) => c.company)).toEqual(["Padaria Boa Vista Ltda"]);
    expect(searchCustomers(db, "PAULA@").map((c) => c.name)).toEqual(["Paula Ramos"]);
    expect(searchCustomers(db, "a").length).toBe(2);
  });

  it("acha por WhatsApp e CPF/CNPJ digitados de qualquer jeito", () => {
    expect(searchCustomers(db, "98888-7777")[0].name).toBe("Ana Souza");
    expect(searchCustomers(db, "11222333")[0].name).toBe("Ana Souza");
    expect(searchCustomers(db, "529.982")[0].name).toBe("Paula Ramos");
  });

  it("traz também os clientes cadastrados pelo painel, marcando a origem", () => {
    createPanelCustomer(db, { name: "Marcos Teixeira", company: "Auto Peças Teixeira", phone: "(11) 95555-8899" }, actor);
    const [found] = searchCustomers(db, "teix");
    expect(found).toMatchObject({ kind: "painel", name: "Marcos Teixeira", phone: "(11) 95555-8899", createdBy: "Bia" });
    expect(found.ref).toMatch(/^painel:/);
    expect(searchCustomers(db, "ana")[0]).toMatchObject({ kind: "conta", ref: "conta:u1" });
  });
});

describe("cadastro pelo painel sem duplicar", () => {
  it("exige nome e WhatsApp válidos; e-mail e CPF/CNPJ, se vierem, precisam ser válidos", () => {
    expect(() => createPanelCustomer(db, { name: "", phone: "(11) 95555-8899" }, actor)).toThrow(/nome/i);
    expect(() => createPanelCustomer(db, { name: "Marcos", phone: "123" }, actor)).toThrow(/WhatsApp/i);
    expect(() => createPanelCustomer(db, { name: "Marcos", phone: "(11) 95555-8899", email: "marcos@" }, actor)).toThrow(/e-mail/i);
    expect(() => createPanelCustomer(db, { name: "Marcos", phone: "(11) 95555-8899", document: "111.111.111-11" }, actor)).toThrow(/CPF/i);
  });

  it("bloqueia quem já tem conta no site com o mesmo WhatsApp, e-mail ou CPF/CNPJ (mesmo escrito diferente)", () => {
    const attempt = (input: Parameters<typeof createPanelCustomer>[1]) => {
      try {
        createPanelCustomer(db, input, actor);
        return null;
      } catch (error) {
        return error as DuplicateCustomerError;
      }
    };
    const byPhone = attempt({ name: "Ana", phone: "+55 11 98888-7777" });
    expect(byPhone).toBeInstanceOf(DuplicateCustomerError);
    expect(byPhone?.matches).toEqual([expect.objectContaining({ ref: "conta:u1", by: ["WhatsApp"] })]);

    expect(attempt({ name: "Ana", phone: "(11) 91111-2222", email: "ANA@padariaboavista.com.br" })?.matches[0].by).toEqual(["e-mail"]);
    expect(attempt({ name: "Padaria", phone: "(11) 91111-2222", document: "11222333000181" })?.matches[0].by).toEqual(["CPF/CNPJ"]);
  });

  it("bloqueia o mesmo cliente cadastrado duas vezes pelo painel", () => {
    createPanelCustomer(db, { name: "Marcos Teixeira", phone: "(11) 95555-8899" }, actor);
    expect(() => createPanelCustomer(db, { name: "Marcos T.", phone: "11955558899" }, { id: "staff-2", name: "Leo" })).toThrow(DuplicateCustomerError);
    expect(searchCustomers(db, "marcos")).toHaveLength(1);
  });

  it("aponta todos os cadastros parecidos de uma vez", () => {
    const matches = findCustomerDuplicates(db, { phone: "(19) 3333-4444", email: "ana@padariaboavista.com.br" });
    expect(matches.map((match) => [match.ref, match.by])).toEqual([["conta:u1", ["e-mail"]], ["conta:u2", ["WhatsApp"]]]);
  });
});

describe("vínculo com a conta do site", () => {
  it("cliente do painel que depois cria conta com o mesmo e-mail passa a ver os orçamentos dele", () => {
    const panel = createPanelCustomer(db, { name: "Marcos Teixeira", phone: "(11) 95555-8899", email: "marcos@teixeira.com.br" }, actor);
    siteAccount("u3", "Marcos", "Marcos@Teixeira.com.br");
    expect(accountQuoteOwners(db, "u3")).toEqual(["u3", `painel:${panel.id}`]);
    expect(accountQuoteOwners(db, "u1")).toEqual(["u1"]);
  });

  it("conta com e-mail NÃO confirmado não puxa os orçamentos do painel (qualquer um poderia usar o e-mail de outro)", () => {
    const panel = createPanelCustomer(db, { name: "Marcos Teixeira", phone: "(11) 95555-8899", email: "marcos@teixeira.com.br" }, actor);
    siteAccount("u3", "Marcos", "marcos@teixeira.com.br");
    db.prepare("UPDATE user SET emailVerified = 0 WHERE id = 'u3'").run();
    expect(accountQuoteOwners(db, "u3")).toEqual(["u3"]);
    // Os dois continuam aparecendo na busca, para o vendedor escolher.
    expect(searchCustomers(db, "marcos").map((customer) => customer.ref).sort()).toEqual(["conta:u3", `painel:${panel.id}`].sort());
  });

  it("depois do vínculo, a busca mostra só a conta do site (não duplica na lista)", () => {
    createPanelCustomer(db, { name: "Marcos Teixeira", phone: "(11) 95555-8899", email: "marcos@teixeira.com.br" }, actor);
    siteAccount("u3", "Marcos Teixeira", "marcos@teixeira.com.br");
    expect(searchCustomers(db, "marcos").map((customer) => customer.ref)).toEqual(["conta:u3"]);
  });

  it("resolve o cliente escolhido no orçamento (dono e dados para o orçamento)", () => {
    const panel = createPanelCustomer(db, { name: "Marcos Teixeira", company: "Auto Peças", phone: "(11) 95555-8899" }, actor);
    expect(resolveCustomer(db, `painel:${panel.id}`)).toMatchObject({ ownerId: `painel:${panel.id}`, name: "Marcos Teixeira", company: "Auto Peças", phone: "(11) 95555-8899" });
    expect(resolveCustomer(db, "conta:u1")).toMatchObject({ ownerId: "u1", name: "Ana Souza", company: "Padaria Boa Vista Ltda", phone: "(11) 98888-7777", email: "ana@padariaboavista.com.br" });
    expect(resolveCustomer(db, "conta:nao-existe")).toBeNull();
    expect(resolveCustomer(db, "qualquer")).toBeNull();
  });
});
