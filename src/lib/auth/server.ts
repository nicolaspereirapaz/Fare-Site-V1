import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { readVerifiedSession } from "@/lib/auth/session";

export async function getCurrentSession() {
  return readVerifiedSession(await headers(), auth.api.getSession);
}
