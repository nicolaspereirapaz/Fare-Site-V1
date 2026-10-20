import type { AccountProfileData, CustomerAddress } from "@/lib/account/profile";

export { formatPhoneBR } from "@/lib/account/documents";

/** Cadastro da conta para preencher formulários; null quando não há login ou algo falha. */
export async function fetchMyProfile(): Promise<AccountProfileData | null> {
  try {
    const response = await fetch("/api/account/profile", { cache: "no-store" });
    return response.ok ? await response.json() as AccountProfileData : null;
  } catch {
    return null;
  }
}

/** Salva nome completo e WhatsApp na conta (criar conta e carrinho). Devolve a mensagem de erro, ou null se deu certo. */
export async function saveMyContact(contact: { name?: string; phone: string }): Promise<string | null> {
  try {
    const response = await fetch("/api/account/profile", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(contact),
    });
    if (response.ok) return null;
    const data = await response.json().catch(() => ({})) as { errors?: Record<string, string> };
    return data.errors?.name ?? data.errors?.phone ?? "Não foi possível salvar seus dados.";
  } catch {
    return "Sem conexão. Tente de novo.";
  }
}

/** Endereço pelo CEP (ViaCEP, gratuito). null se o CEP não existir ou o serviço falhar. */
export async function lookupCep(cep: string): Promise<Pick<CustomerAddress, "street" | "district" | "city" | "state"> | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) return null;
    const data = await response.json() as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (data.erro) return null;
    return { street: data.logradouro ?? "", district: data.bairro ?? "", city: data.localidade ?? "", state: data.uf ?? "" };
  } catch {
    return null;
  }
}
