import { atendimentoDb, json, withStaff } from "@/lib/atendimento/server";
import { startOfTodaySp, teamReport } from "@/lib/atendimento/report";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

/** Relatório da equipe: ?periodo=hoje | 7 | 30 (dias). */
export const GET = withStaff((_staff, request) => {
  const period = new URL(request.url).searchParams.get("periodo") ?? "7";
  const now = new Date();
  const from = period === "hoje" ? startOfTodaySp(now) : new Date(startOfTodaySp(now).getTime() - ((period === "30" ? 30 : 7) - 1) * DAY);
  return json({ period, report: teamReport(atendimentoDb(), { from, to: now }) });
});
