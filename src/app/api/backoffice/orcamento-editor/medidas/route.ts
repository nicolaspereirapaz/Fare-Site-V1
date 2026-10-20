import { specsByPublicId } from "@/lib/proposals/catalogImages";
import { getStaffSession } from "@/lib/staff/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Medidas do produto para os detalhes em "Escolha o produto" (XBZ é lida da página do produto na 1ª vez). */
export async function GET(request: Request) {
  const session = await getStaffSession(request.headers);
  if (!session) return Response.json({ error: "Entre na área da equipe." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id")?.slice(0, 80) ?? "";
  return Response.json({ specs: id ? await specsByPublicId(id) : [] }, { headers: { "Cache-Control": "no-store" } });
}
