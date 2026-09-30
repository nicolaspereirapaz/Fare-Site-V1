import type { SessionReader } from "@/lib/auth/session";
import {
  BRAZILIAN_STATES,
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhoneBR,
  isBrazilianPhone,
  isValidCnpj,
  isValidCpf,
} from "@/lib/account/documents";

export type PersonType = "pf" | "pj";

export type CustomerAddress = {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

/**
 * Cadastro do cliente.
 * - PF: nome completo + CPF.
 * - PJ: nome do responsável + CNPJ, razão social, nome fantasia e inscrição estadual (ou ISENTO).
 * O e-mail é o do login e não faz parte deste formulário.
 */
export type CustomerProfile = {
  personType: PersonType;
  name: string;
  document: string;
  companyName: string;
  tradeName: string;
  stateRegistration: string;
  phone: string;
  address: CustomerAddress;
};

/** O nome fica na tabela de usuários do login; o resto, na tabela da loja. */
export type StoredProfile = Omit<CustomerProfile, "name">;
export type AccountProfileData = CustomerProfile & { email: string; complete: boolean };
export type ProfileErrors = Partial<Record<keyof Omit<CustomerProfile, "address"> | keyof CustomerAddress, string>>;

export const EMPTY_ADDRESS: CustomerAddress = { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };
export const EMPTY_PROFILE: CustomerProfile = {
  personType: "pf",
  name: "",
  document: "",
  companyName: "",
  tradeName: "",
  stateRegistration: "",
  phone: "",
  address: EMPTY_ADDRESS,
};

const LIMITS = { name: 120, companyName: 160, tradeName: 160, stateRegistration: 20, street: 160, number: 20, complement: 80, district: 80, city: 80 };

function text(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeProfileInput(value: unknown):
  | { ok: true; value: CustomerProfile }
  | { ok: false; errors: ProfileErrors } {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawAddress = record.address && typeof record.address === "object" ? record.address as Record<string, unknown> : {};
  const personType: PersonType = record.personType === "pj" ? "pj" : "pf";
  const pj = personType === "pj";
  const errors: ProfileErrors = {};

  const name = text(record, "name");
  const rawDocument = text(record, "document");
  const phone = text(record, "phone");
  const companyName = pj ? text(record, "companyName") : "";
  const tradeName = pj ? text(record, "tradeName") : "";
  const rawIe = pj ? text(record, "stateRegistration").toUpperCase() : "";
  const stateRegistration = rawIe === "ISENTO" ? "ISENTO" : rawIe;

  const address: CustomerAddress = {
    cep: formatCep(text(rawAddress, "cep")),
    street: text(rawAddress, "street"),
    number: text(rawAddress, "number"),
    complement: text(rawAddress, "complement"),
    district: text(rawAddress, "district"),
    city: text(rawAddress, "city"),
    state: text(rawAddress, "state").toUpperCase(),
  };

  if (name.length < 3 || name.length > LIMITS.name) errors.name = pj ? "Informe o nome do responsável." : "Informe seu nome completo.";
  if (pj ? !isValidCnpj(rawDocument) : !isValidCpf(rawDocument)) errors.document = pj ? "CNPJ inválido." : "CPF inválido.";
  if (!isBrazilianPhone(phone)) errors.phone = "Informe um telefone com DDD.";
  if (pj) {
    if (companyName.length < 2 || companyName.length > LIMITS.companyName) errors.companyName = "Informe a razão social.";
    if (tradeName.length > LIMITS.tradeName) errors.tradeName = "Nome fantasia grande demais.";
    if (stateRegistration !== "ISENTO" && !/^[0-9A-Z.\-/ ]{2,20}$/.test(stateRegistration)) {
      errors.stateRegistration = "Informe a inscrição estadual ou marque isento.";
    }
  }
  if (address.cep.length !== 9) errors.cep = "CEP inválido.";
  if (!address.street || address.street.length > LIMITS.street) errors.street = "Informe a rua.";
  if (!address.number || address.number.length > LIMITS.number) errors.number = "Informe o número (ou S/N).";
  if (address.complement.length > LIMITS.complement) errors.complement = "Complemento grande demais.";
  if (!address.district || address.district.length > LIMITS.district) errors.district = "Informe o bairro.";
  if (!address.city || address.city.length > LIMITS.city) errors.city = "Informe a cidade.";
  if (!(BRAZILIAN_STATES as readonly string[]).includes(address.state)) errors.state = "Selecione o estado.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      personType,
      name,
      document: pj ? formatCnpj(rawDocument) : formatCpf(rawDocument),
      companyName,
      tradeName,
      stateRegistration,
      phone: formatPhoneBR(phone),
      address,
    },
  };
}

/** Separa o nome (fica no login) do resto do cadastro (tabela da loja). */
export function toStoredProfile(profile: CustomerProfile): StoredProfile {
  return {
    personType: profile.personType,
    document: profile.document,
    companyName: profile.companyName,
    tradeName: profile.tradeName,
    stateRegistration: profile.stateRegistration,
    phone: profile.phone,
    address: profile.address,
  };
}

/** Só os campos do cadastro, sem e-mail/complete da resposta da API. */
export function toCustomerProfile(data: AccountProfileData): CustomerProfile {
  return { ...toStoredProfile(data), name: data.name };
}

export function isProfileComplete(profile: CustomerProfile) {
  return normalizeProfileInput(profile).ok;
}

export type ProfileSession = { user: { id: string; name: string; email: string } };
export type ProfileDeps = {
  readProfile: (userId: string) => StoredProfile;
  saveProfile: (userId: string, profile: StoredProfile) => void;
  /** Troca o nome pela biblioteca de login, com a sessão de quem pediu. */
  updateName: (name: string, headers: Headers) => Promise<unknown>;
};

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function toResponse(profile: CustomerProfile, email: string): AccountProfileData {
  return { ...profile, email, complete: isProfileComplete(profile) };
}

export function createProfileHandlers(getSession: SessionReader<ProfileSession>, deps: ProfileDeps) {
  async function GET(request: Request): Promise<Response> {
    const session = await getSession({ headers: request.headers });
    if (!session) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401, headers: NO_STORE });
    const profile = { ...deps.readProfile(session.user.id), name: session.user.name };
    return Response.json(toResponse(profile, session.user.email), { headers: NO_STORE });
  }

  async function PUT(request: Request): Promise<Response> {
    const session = await getSession({ headers: request.headers });
    if (!session) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401, headers: NO_STORE });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers: NO_STORE });
    }
    const parsed = normalizeProfileInput(body);
    if (!parsed.ok) return Response.json({ error: "INVALID_FIELDS", errors: parsed.errors }, { status: 400, headers: NO_STORE });

    // Sempre o usuário da sessão: id/e-mail enviados no corpo são ignorados.
    const { name } = parsed.value;
    if (name !== session.user.name) await deps.updateName(name, request.headers);
    deps.saveProfile(session.user.id, toStoredProfile(parsed.value));

    return Response.json(toResponse(parsed.value, session.user.email), { headers: NO_STORE });
  }

  return { GET, PUT };
}
