import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_PROFILE,
  createProfileHandlers,
  isProfileComplete,
  normalizeProfileInput,
  toStoredProfile,
  type CustomerProfile,
  type StoredProfile,
} from "@/lib/account/profile";
import { getCustomerProfile, saveCustomerProfile } from "@/lib/account/profileRepository";

const ADDRESS = {
  cep: "13201-000", street: "Rua Barão de Jundiaí", number: "100", complement: "Sala 2",
  district: "Centro", city: "Jundiaí", state: "SP",
};

const PF: CustomerProfile = {
  ...EMPTY_PROFILE,
  personType: "pf",
  name: "Ana Silva",
  document: "529.982.247-25",
  phone: "(11) 98888-7777",
  address: ADDRESS,
};

const PJ: CustomerProfile = {
  ...EMPTY_PROFILE,
  personType: "pj",
  name: "Carlos Souza",
  document: "11.222.333/0001-81",
  companyName: "Padaria Boa Vista Ltda",
  tradeName: "Padaria Boa Vista",
  stateRegistration: "407.123.456.789",
  phone: "(11) 3333-4444",
  address: ADDRESS,
};

const stored = (profile: CustomerProfile): StoredProfile => toStoredProfile(profile);

describe("cadastro de pessoa física e jurídica", () => {
  it("aceita pessoa física com CPF e endereço, limpando espaços e formatando", () => {
    const result = normalizeProfileInput({ ...PF, name: "  Ana   Silva ", document: "52998224725", address: { ...ADDRESS, cep: "13201000", state: "sp" } });
    expect(result).toEqual({ ok: true, value: PF });
  });

  it("pessoa física não guarda dados de empresa", () => {
    const result = normalizeProfileInput({ ...PF, companyName: "X", tradeName: "Y", stateRegistration: "123" });
    expect(result.ok && result.value).toMatchObject({ companyName: "", tradeName: "", stateRegistration: "" });
  });

  it("aceita pessoa jurídica com CNPJ, razão social e inscrição estadual (ou isento)", () => {
    expect(normalizeProfileInput(PJ)).toEqual({ ok: true, value: PJ });
    const isento = normalizeProfileInput({ ...PJ, stateRegistration: "isento", tradeName: "" });
    expect(isento.ok && isento.value.stateRegistration).toBe("ISENTO");
  });

  it("aponta todos os campos com problema de uma vez", () => {
    const result = normalizeProfileInput({ personType: "pj", name: "", document: "11.222.333/0001-82", phone: "123", address: {} });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(
      ["cep", "city", "companyName", "district", "document", "name", "number", "phone", "state", "stateRegistration", "street"].sort(),
    );
    expect(!result.ok && result.errors.document).toBe("CNPJ inválido.");
  });

  it("CPF inválido para pessoa física; UF precisa existir", () => {
    const result = normalizeProfileInput({ ...PF, document: "111.111.111-11", address: { ...ADDRESS, state: "XX" } });
    expect(!result.ok && result.errors).toEqual({ document: "CPF inválido.", state: "Selecione o estado." });
  });

  it("sabe se o cadastro está completo", () => {
    expect(isProfileComplete(PF)).toBe(true);
    expect(isProfileComplete({ ...EMPTY_PROFILE, name: "Ana", phone: "(11) 98888-7777" })).toBe(false);
  });
});

describe("cadastro no banco", () => {
  it("começa vazio, salva e atualiza sem duplicar", () => {
    const db = new DatabaseSync(":memory:");
    expect(getCustomerProfile(db, "u1")).toEqual(stored(EMPTY_PROFILE));

    saveCustomerProfile(db, "u1", stored(PF));
    saveCustomerProfile(db, "u1", stored(PJ));
    saveCustomerProfile(db, "u2", stored(PF));

    expect(getCustomerProfile(db, "u1")).toEqual(stored(PJ));
    expect(getCustomerProfile(db, "u2")).toEqual(stored(PF));
  });

  it("atualiza a tabela da versão anterior (só telefone e empresa) sem perder dados", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE fare_customer_profiles (user_id TEXT PRIMARY KEY, phone TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)");
    db.prepare("INSERT INTO fare_customer_profiles VALUES ('u1', '(11) 98888-7777', 'Loja A', '2026-09-29')").run();

    expect(getCustomerProfile(db, "u1")).toMatchObject({ personType: "pf", phone: "(11) 98888-7777", companyName: "Loja A", document: "" });
  });
});

function deps(initial: StoredProfile = stored(EMPTY_PROFILE)) {
  let current = initial;
  return {
    readProfile: vi.fn(() => current),
    saveProfile: vi.fn((_userId: string, value: StoredProfile) => { current = value; }),
    updateName: vi.fn(async () => undefined),
  };
}

const put = (body: unknown) => new Request("http://localhost/api/account/profile", {
  method: "PUT",
  headers: { "content-type": "application/json", cookie: "better-auth.session_token=x" },
  body: JSON.stringify(body),
});
const SESSION = async () => ({ user: { id: "u1", name: "Ana Silva", email: "ana@x.com" } });

describe("API /api/account/profile", () => {
  it("exige login", async () => {
    const d = deps();
    const { GET, PUT } = createProfileHandlers(async () => null, d);
    expect((await GET(new Request("http://localhost/api/account/profile"))).status).toBe(401);
    expect((await PUT(put(PF))).status).toBe(401);
    expect(d.saveProfile).not.toHaveBeenCalled();
  });

  it("devolve o cadastro do usuário da sessão e se está completo", async () => {
    const { GET } = createProfileHandlers(SESSION, deps(stored(PF)));
    const response = await GET(new Request("http://localhost/api/account/profile"));
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ ...PF, email: "ana@x.com", complete: true });
  });

  it("salva sempre no usuário da sessão (ignora id e e-mail enviados)", async () => {
    const d = deps();
    const response = await createProfileHandlers(SESSION, d).PUT(put({ ...PJ, userId: "outro", email: "hack@x.com" }));

    expect(response.status).toBe(200);
    const [newName, headers] = d.updateName.mock.calls[0] as unknown as [string, Headers];
    expect(newName).toBe("Carlos Souza");
    expect(headers.get("cookie")).toBe("better-auth.session_token=x");
    expect(d.saveProfile).toHaveBeenCalledWith("u1", stored(PJ));
    await expect(response.json()).resolves.toEqual({ ...PJ, email: "ana@x.com", complete: true });
  });

  it("não troca o nome se ele não mudou", async () => {
    const d = deps();
    await createProfileHandlers(SESSION, d).PUT(put(PF));
    expect(d.updateName).not.toHaveBeenCalled();
  });

  it("responde os campos inválidos", async () => {
    const d = deps();
    const response = await createProfileHandlers(SESSION, d).PUT(put({ ...PF, document: "123" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_FIELDS", errors: { document: "CPF inválido." } });
    expect(d.saveProfile).not.toHaveBeenCalled();
  });
});
