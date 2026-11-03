import { knownTags } from "@/lib/atendimento/repository";
import { atendimentoDb, json, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Etiquetas para sugerir ao marcar uma conversa (padrão + as que a equipe já usa). */
export const GET = withStaff(() => json({ tags: knownTags(atendimentoDb()) }));
