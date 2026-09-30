import { getCustomerProfile, saveCustomerProfile } from "@/lib/account/profileRepository";
import { formatPhoneBR } from "@/lib/account/documents";
import { auth, database } from "@/lib/auth";
import { createCheckoutHandler } from "@/lib/checkout";
import { createOrder } from "@/lib/orders/repository";

export const POST = createCheckoutHandler(
  auth.api.getSession,
  (input) => createOrder(database, input),
  (userId, customer) => {
    // Só completa a conta: o que o cliente já salvou em "Dados pessoais" não é sobrescrito.
    const current = getCustomerProfile(database, userId);
    if (current.phone) return;
    saveCustomerProfile(database, userId, {
      ...current,
      phone: formatPhoneBR(customer.phone ?? ""),
      companyName: current.companyName || (customer.company ?? "").trim(),
    });
  },
);
