import { createProfileHandlers } from "@/lib/account/profile";
import { getCustomerProfile, saveCustomerProfile } from "@/lib/account/profileRepository";
import { auth, database } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const { GET, PUT } = createProfileHandlers(auth.api.getSession, {
  readProfile: (userId) => getCustomerProfile(database, userId),
  saveProfile: (userId, contact) => saveCustomerProfile(database, userId, contact),
  updateName: (name, headers) => auth.api.updateUser({ body: { name }, headers }),
});
