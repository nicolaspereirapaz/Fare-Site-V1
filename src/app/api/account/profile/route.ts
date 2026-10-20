import { createProfileHandlers } from "@/lib/account/profile";
import { getCustomerProfile, saveCustomerProfile } from "@/lib/account/profileRepository";
import { database } from "@/lib/auth";
import { getStoreSession, updateStoreName } from "@/lib/auth/storeSession";

export const dynamic = "force-dynamic";

export const { GET, PUT, PATCH } = createProfileHandlers(getStoreSession, {
  readProfile: (userId) => getCustomerProfile(database, userId),
  saveProfile: (userId, contact) => saveCustomerProfile(database, userId, contact),
  updateName: updateStoreName,
});
