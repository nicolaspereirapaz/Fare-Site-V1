import { headers } from "next/headers";
import { getStoreSession } from "@/lib/auth/storeSession";
import { readVerifiedSession } from "@/lib/auth/session";

export async function getCurrentSession() {
  return readVerifiedSession(await headers(), getStoreSession);
}
