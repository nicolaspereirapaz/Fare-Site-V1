import { database } from "@/lib/auth";
import { getStoreSession } from "@/lib/auth/storeSession";
import { redeemProfessionalInvite } from "@/lib/professional";

export const dynamic = "force-dynamic";

/** Usa o convite profissional na conta logada. */
export async function POST(request: Request) {
  const session = await getStoreSession({ headers: request.headers });
  if (!session) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  let token = "";
  try { token = String(((await request.json()) as { token?: unknown }).token ?? ""); } catch { /* corpo inválido */ }
  try {
    redeemProfessionalInvite(database, token, session.user.id);
    return Response.json({ professional: true });
  } catch (error) {
    return Response.json({ error: "INVALID_INVITE", message: error instanceof Error ? error.message : "Convite inválido." }, { status: 400 });
  }
}
