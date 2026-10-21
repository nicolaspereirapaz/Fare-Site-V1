import { database } from "@/lib/auth";
import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import { createProfessionalInvite, setProfessional } from "@/lib/professional";
import { getStaffSession } from "@/lib/staff/server";

export const dynamic = "force-dynamic";

const SITE = process.env.FARE_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.farefoto.com.br";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Clientes profissionais (só equipe):
 *   { action: "convite" }                    → link de cadastro com a tabela profissional
 *   { action: "marcar", ref: "conta:…", on } → liga/desliga a tabela profissional de uma conta
 */
export async function POST(request: Request) {
  const session = await getStaffSession(request.headers);
  if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
  if (!hasBackofficeAccess(resolveUserRole(session.user))) return json({ error: "FORBIDDEN" }, 403);
  let body: { action?: unknown; ref?: unknown; on?: unknown } = {};
  try { body = await request.json(); } catch { return json({ error: "INVALID_REQUEST" }, 400); }
  if (body.action === "convite") {
    const { token, expiresAt } = createProfessionalInvite(database, session.user.name);
    return json({ link: `${SITE.replace(/\/$/, "")}/convite/${token}`, expiresAt });
  }
  if (body.action === "marcar" && typeof body.ref === "string" && body.ref.startsWith("conta:") && typeof body.on === "boolean") {
    setProfessional(database, body.ref.slice("conta:".length), body.on, session.user.name);
    return json({ professional: body.on });
  }
  return json({ error: "INVALID_REQUEST", message: "Só contas do site podem ter a tabela profissional." }, 400);
}
