"use client";

import "@/components/staff/atendimento/atendimento.css";
import "@/components/staff/atendimento/atendimento-dark.css";
import Link from "next/link";
import { ArrowLeft, Bot, Clock, MessagesSquare, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/staff/atendimento/shared";
import { ThemeToggle } from "@/components/staff/atendimento/theme";
import type { TeamReport } from "@/lib/atendimento/report";

type Period = "hoje" | "7" | "30";
const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "hoje", label: "Hoje" },
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
];

/** "4,5 min", "1 h 20 min". */
export function formatMinutes(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${String(Math.round(minutes * 10) / 10).replace(".", ",")} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Relatório da equipe: volume, IA, tempo até o vendedor responder, desempenho por vendedor, esperas longas e horários. */
export function ReportApp() {
  const [period, setPeriod] = useState<Period>("7");
  const [report, setReport] = useState<TeamReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (which: Period) => {
    setLoading(true);
    setError(null);
    try {
      setReport((await api<{ report: TeamReport }>(`/api/atendimento/relatorio?periodo=${which}`)).report);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar o relatório.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<{ report: TeamReport }>(`/api/atendimento/relatorio?periodo=${period}`)
      .then((data) => active && setReport(data.report))
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Erro ao carregar o relatório."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [period]);

  const totals = report?.totals;
  const maxHour = Math.max(1, ...(report?.hours ?? [0]));
  return (
    <main className="at-report">
      <header className="at-report-head">
        <div>
          <Link className="at-report-back" href="/equipe/atendimento">
            <ArrowLeft aria-hidden="true" size={15} /> Atendimento
          </Link>
          <h1 className="at-title">Relatório da equipe</h1>
        </div>
        <div className="at-seg" role="group" aria-label="Período">
          {PERIODS.map((item) => (
            <button aria-pressed={period === item.id} className={period === item.id ? "is-active" : undefined} key={item.id} onClick={() => { setLoading(true); setPeriod(item.id); }} type="button">
              {item.label}
            </button>
          ))}
        </div>
        <ThemeToggle className="at-btn" />
        <button aria-label="Atualizar" className="at-btn at-btn-quiet" disabled={loading} onClick={() => void load(period)} type="button">
          <RefreshCw aria-hidden="true" size={15} /> Atualizar
        </button>
      </header>

      {error ? <div className="at-banner at-banner-error" role="alert">{error}</div> : null}
      {!report && loading ? <p className="at-muted at-center">Carregando…</p> : null}

      {totals ? (
        <>
          <section className="at-report-cards" aria-label="Resumo">
            <Card icon={<MessagesSquare size={18} />} label="Conversas com clientes" value={String(totals.conversations)} note={`${totals.customerMessages} mensagens de clientes`} />
            <Card
              icon={<Bot size={18} />}
              label="Resolvidas só pela IA"
              value={totals.resolvedByAiPercent === null ? "—" : `${totals.resolvedByAiPercent}%`}
              note={`${totals.resolvedByAi} conversas · ${totals.aiMessages} respostas da IA`}
            />
            <Card icon={<Users size={18} />} label="Pedidos de vendedor" value={String(totals.handoffs)} note={`${totals.staffMessages} mensagens da equipe`} />
            <Card
              icon={<Clock size={18} />}
              label="Espera até o vendedor responder"
              value={formatMinutes(totals.waitAverageMinutes)}
              note={`média · mediana ${formatMinutes(totals.waitMedianMinutes)} · maior ${formatMinutes(totals.waitMaxMinutes)}`}
            />
            <Card
              alert={totals.waitingNow > 0}
              icon={<Clock size={18} />}
              label="Esperando agora"
              value={String(totals.waitingNow)}
              note={totals.waitingNow ? "clientes aguardando vendedor" : "ninguém esperando"}
            />
          </section>

          <section className="at-report-block">
            <h2>Por vendedor</h2>
            {report.sellers.length ? (
              <table className="at-report-table">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Mensagens</th>
                    <th>Conversas</th>
                    <th>Pedidos atendidos</th>
                    <th>Tempo médio de resposta</th>
                    <th>Finalizadas</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sellers.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name === "Celular" ? "Celular (WhatsApp)" : row.name}</td>
                      <td>{row.messages}</td>
                      <td>{row.conversations}</td>
                      <td>{row.handoffsAnswered}</td>
                      <td>{formatMinutes(row.waitAverageMinutes)}</td>
                      <td>{row.finished}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="at-muted">Nenhuma mensagem da equipe no período.</p>
            )}
            <p className="at-muted">Tempo de resposta = do pedido de vendedor (pela IA ou pela fila) até a 1ª mensagem da equipe.</p>
          </section>

          <section className="at-report-block">
            <h2>Clientes que esperaram mais de 10 minutos</h2>
            {report.longWaits.length ? (
              <table className="at-report-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Pediu vendedor</th>
                    <th>Esperou</th>
                    <th>Quem respondeu</th>
                  </tr>
                </thead>
                <tbody>
                  {report.longWaits.map((row) => (
                    <tr className={row.waiting ? "is-waiting" : undefined} key={`${row.conversationId}-${row.askedAt}`}>
                      <td>
                        <Link href={`/equipe/atendimento?conversa=${row.conversationId}`}>{row.contact}</Link>
                      </td>
                      <td>{new Date(row.askedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td>{formatMinutes(row.minutes)}</td>
                      <td>{row.waiting ? <strong>ainda esperando</strong> : row.answeredBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="at-muted">Ninguém esperou mais de 10 minutos. 👏</p>
            )}
          </section>

          <section className="at-report-block">
            <h2>Mensagens de clientes por horário</h2>
            <div className="at-hours" role="img" aria-label="Mensagens de clientes por hora do dia">
              {report.hours.map((count, hour) => (
                <div className="at-hour" key={hour} title={`${hour}h: ${count} mensagens`}>
                  <span className="at-hour-bar" style={{ height: `${Math.round((count / maxHour) * 100)}%` }} />
                  <small>{hour}</small>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Card({ icon, label, value, note, alert = false }: { icon: React.ReactNode; label: string; value: string; note: string; alert?: boolean }) {
  return (
    <div className={`at-report-card${alert ? " is-alert" : ""}`}>
      <span className="at-report-card-label">
        {icon} {label}
      </span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
