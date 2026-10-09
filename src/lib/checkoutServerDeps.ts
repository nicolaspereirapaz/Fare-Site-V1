import { isProfileComplete } from "@/lib/account/profile";
import { formatPhoneBR } from "@/lib/account/documents";
import { getCustomerProfile, saveCustomerProfile } from "@/lib/account/profileRepository";
import { database } from "@/lib/auth";
import { campaignQuantityPricing } from "@/lib/campaignPricing";
import type { CheckoutOptions } from "@/lib/checkout";
import { repriceCartItems } from "@/lib/orders/serverPricing";
import { publicProductId } from "@/lib/publicCatalog";
import { groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";

/** Dependências reais (banco + catálogo) usadas pelas rotas de pedido e de orçamento. */
export const checkoutServerDeps: Required<CheckoutOptions> = {
  // O valor sai do catálogo local, nunca do navegador.
  priceItems: async (items) => {
    if (!items.some((item) => item.slug.startsWith("brindes/"))) return repriceCartItems(items, () => null);
    const { products } = await getLocalCatalog();
    const byId = new Map(groupAvailableProducts(products).map((product) => [publicProductId(product.internalCode), product]));
    return repriceCartItems(items, (publicId) => {
      const product = byId.get(publicId);
      return product ? campaignQuantityPricing(product) : null;
    });
  },
  // Dados da nota vêm do cadastro salvo na conta (nunca do navegador) e ficam gravados.
  readBilling: (userId) => {
    const profile = getCustomerProfile(database, userId);
    // O nome não entra no faturamento; só precisa existir para a validação do cadastro.
    if (!isProfileComplete({ ...profile, name: "cliente" })) return null;
    const { personType, document, companyName, tradeName, stateRegistration, address } = profile;
    return { personType, document, companyName, tradeName, stateRegistration, address };
  },
  // Só completa a conta: o que o cliente já salvou em "Dados pessoais" não é sobrescrito.
  rememberContact: (userId, customer) => {
    const current = getCustomerProfile(database, userId);
    if (current.phone) return;
    saveCustomerProfile(database, userId, {
      ...current,
      phone: formatPhoneBR(customer.phone ?? ""),
      companyName: current.companyName || (customer.company ?? "").trim(),
    });
  },
};
