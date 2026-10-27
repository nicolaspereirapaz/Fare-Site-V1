import { formatCep } from "@/lib/account/documents";

/** Endereço de entrega do cliente (cadastro da equipe). Sem dependências de servidor: usado também no formulário. */
export type DeliveryAddress = {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  /** Ponto de referência para o entregador. */
  reference: string;
};

export const EMPTY_ADDRESS: DeliveryAddress = { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "", reference: "" };

const LIMITS: Record<keyof DeliveryAddress, number> = { cep: 9, street: 160, number: 20, complement: 80, district: 80, city: 80, state: 2, reference: 200 };

/** Endereço vindo do navegador (ou do banco): campos limpos; tudo vazio = null. */
export function parseDeliveryAddress(raw: unknown): DeliveryAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const text = (key: keyof DeliveryAddress) => String(body[key] ?? "").trim().replace(/\s+/g, " ").slice(0, LIMITS[key]);
  const address: DeliveryAddress = {
    cep: formatCep(text("cep")),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    district: text("district"),
    city: text("city"),
    state: text("state").toUpperCase(),
    reference: text("reference"),
  };
  if (address.cep && address.cep.length !== 9) throw new Error("CEP inválido.");
  return Object.values(address).some(Boolean) ? address : null;
}

/** "Rua X, 100, Apto 2 — Centro — Jundiaí/SP — CEP 13201-000 · Referência: portão azul" (só as partes preenchidas). */
export function formatDeliveryAddress(address: DeliveryAddress | null | undefined): string {
  if (!address) return "";
  const main = [
    [address.street, address.number, address.complement].filter(Boolean).join(", "),
    address.district,
    [address.city, address.state].filter(Boolean).join("/"),
    address.cep ? `CEP ${address.cep}` : "",
  ].filter(Boolean).join(" — ");
  return [main, address.reference ? `Referência: ${address.reference}` : ""].filter(Boolean).join(" · ");
}
