import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import { getStaffSession, type StaffSession } from "@/lib/staff/server";

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const chaveValida = (chave: string) => /^[0-9A-Z]{50}$/.test(chave);

/** Emissor de NFS-e: só a equipe logada (vendedor ou admin). Devolve a sessão ou a resposta de erro. */
export async function exigirEquipe(request: Request): Promise<{ session: StaffSession } | { erro: Response }> {
  const session = await getStaffSession(request.headers);
  if (!session) return { erro: json({ ok: false, erros: ["Faça login na área da equipe."] }, 401) };
  if (!hasBackofficeAccess(resolveUserRole(session.user))) return { erro: json({ ok: false, erros: ["Sem acesso."] }, 403) };
  return { session };
}
