import { headers } from "next/headers";
import { staffAuth } from "@/lib/staff/auth";

export type StaffSession = { user: { id: string; name: string; email: string; role: "vendedor" | "admin" } };

/** Sessão da equipe (cookie fare-equipe.*). A sessão de cliente do site NÃO vale aqui. */
export async function getStaffSession(requestHeaders?: Headers): Promise<StaffSession | null> {
  const session = await staffAuth.api.getSession({ headers: requestHeaders ?? (await headers()) });
  return (session as StaffSession | null) ?? null;
}
