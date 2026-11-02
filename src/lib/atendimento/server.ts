import { database } from "@/lib/auth";
import { AtendimentoError, runAtendimentoMigrations, type StaffActor } from "@/lib/atendimento/repository";
import { readStaffSession } from "@/lib/staff/server";

/** Banco do site (o mesmo dos clientes/orçamentos), com as tabelas do atendimento garantidas. */
const globalAtendimento = globalThis as typeof globalThis & { fareAtendimentoMigrated?: boolean };
export function atendimentoDb() {
  if (!globalAtendimento.fareAtendimentoMigrated) {
    runAtendimentoMigrations(database);
    globalAtendimento.fareAtendimentoMigrated = true;
  }
  return database;
}

const STATUS_BY_CODE: Record<AtendimentoError["code"], number> = {
  CONVERSATION_NOT_FOUND: 404,
  QUICK_REPLY_NOT_FOUND: 404,
  ASSIGNED_TO_OTHER: 409,
  NOT_ASSIGNED: 409,
  DUPLICATE_SHORTCUT: 409,
  INVALID_REQUEST: 400,
};

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Toda rota do atendimento: exige login da equipe e converte erros conhecidos em resposta com código. */
export function withStaff<Args extends unknown[]>(handler: (staff: StaffActor & { role: string }, request: Request, ...args: Args) => Promise<Response> | Response) {
  return async (request: Request, ...args: Args) => {
    const session = await readStaffSession({ headers: request.headers });
    if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
    try {
      return await handler({ id: session.user.id, name: session.user.name, role: session.user.role }, request, ...args);
    } catch (error) {
      if (error instanceof AtendimentoError) return json({ error: error.code, message: error.message, detail: error.detail ?? null }, STATUS_BY_CODE[error.code]);
      console.error("[atendimento]", error);
      return json({ error: "INTERNAL", message: "Não foi possível concluir a operação." }, 500);
    }
  };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // corpo inválido
  }
  throw new AtendimentoError("INVALID_REQUEST", "Não foi possível entender a requisição.");
}

export const text = (value: unknown, max = 4000) => (typeof value === "string" ? value.slice(0, max) : "");
