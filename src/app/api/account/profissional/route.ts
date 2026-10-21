import { database } from "@/lib/auth";
import { getStoreSession } from "@/lib/auth/storeSession";
import { isProfessional } from "@/lib/professional";

export const dynamic = "force-dynamic";

/** O cliente logado usa a tabela profissional? (sem login: não) */
export async function GET(request: Request) {
  const session = await getStoreSession({ headers: request.headers });
  return Response.json({ professional: isProfessional(database, session?.user.id) }, { headers: { "Cache-Control": "no-store" } });
}
