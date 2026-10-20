import { auth, database } from "@/lib/auth";
import { readGuestId } from "@/lib/auth/temporaryGuest";

function guestTable() {
  database.exec("CREATE TABLE IF NOT EXISTS fare_temporary_visitors (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)");
}

/** Real sessions take precedence. Guest IDs are verified again here, not trusted from Proxy. */
export async function getStoreSession({ headers }: { headers: Headers }) {
  const session = await auth.api.getSession({ headers });
  if (session) return session;
  const id = readGuestId(headers);
  if (!id) return null;
  guestTable();
  database.prepare("INSERT OR IGNORE INTO fare_temporary_visitors (id, name, created_at) VALUES (?, '', ?)").run(id, new Date().toISOString());
  const guest = database.prepare("SELECT name FROM fare_temporary_visitors WHERE id = ?").get(id) as { name: string };
  return { user: { id, name: guest.name, email: "", emailVerified: false, role: "cliente", isTemporary: true } };
}

/** Called only after the normal PF/PJ validation, for the cookie's own visitor. */
export async function updateStoreName(name: string, headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (session) return auth.api.updateUser({ body: { name }, headers });
  const id = readGuestId(headers);
  if (!id) throw new Error("AUTH_REQUIRED");
  guestTable();
  database.prepare("UPDATE fare_temporary_visitors SET name = ? WHERE id = ?").run(name, id);
}
