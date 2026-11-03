import { AtendimentoError, aiEnabled, setAiEnabled } from "@/lib/atendimento/repository";
import { activeBrain, atendimentoDb, json, readJson, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Configuração do atendimento: IA ligada/desligada. */
export const GET = withStaff(() => json({ aiEnabled: aiEnabled(atendimentoDb()), aiMode: activeBrain().mode }));

/** Ligar/desligar a IA: só administradores. */
export const PATCH = withStaff(async (staff, request) => {
  if (staff.role !== "admin") throw new AtendimentoError("INVALID_REQUEST", "Só administradores ligam ou desligam a IA.");
  const body = await readJson(request);
  if (typeof body.aiEnabled !== "boolean") throw new AtendimentoError("INVALID_REQUEST", "Valor inválido.");
  const db = atendimentoDb();
  setAiEnabled(db, body.aiEnabled);
  return json({ aiEnabled: aiEnabled(db), aiMode: activeBrain().mode });
});
