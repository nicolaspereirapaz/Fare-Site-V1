import { isProfileComplete } from "@/lib/account/profile";
import { formatPhoneBR } from "@/lib/account/documents";
import { getCustomerProfile, saveCustomerProfile } from "@/lib/account/profileRepository";
import { auth, database } from "@/lib/auth";
import { createCheckoutHandler } from "@/lib/checkout";
import { createOrder } from "@/lib/orders/repository";

export const POST = createCheckoutHandler(
  auth.api.getSession,
  (input) => createOrder(database, input),
  {
    // Dados da nota vêm do cadastro salvo na conta (nunca do navegador) e ficam gravados no pedido.
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
  },
);
