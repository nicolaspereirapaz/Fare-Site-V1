import { headers } from "next/headers";
import { staffAuth } from "@/lib/staff/auth";
import { resolveTemporaryStaff } from "@/lib/auth/temporaryAccess";

export type StaffSession = { user: { id: string; name: string; email: string; role: "vendedor" | "admin" } };

/** Sessão da equipe (cookie fare-equipe.*). A sessão de cliente do site NÃO vale aqui. */
export async function getStaffSession(requestHeaders?: Headers): Promise<StaffSession | null> {
  const session = await staffAuth.api.getSession({ headers: requestHeaders ?? (await headers()) });
  return resolveTemporaryStaff((session as StaffSession | null) ?? null);
}

/** Same reader for every backoffice handler and server-rendered page. */
export function readStaffSession({ headers }: { headers: Headers }) {
  return getStaffSession(headers);
}
