/**
 * Escolha da personalização da Spot em níveis, do geral para o específico:
 * Componente → Local → Técnica → Área → Nº de cores.
 * Cada nível só oferece o que existe para as escolhas de cima. Sem dependências de servidor
 * (usado na tela do editor de orçamento).
 */

export type SpotPickable = { id: string; componente: string; local: string; tecnica: string; area: string; cores: number; padrao: boolean };

type LevelKey = "componente" | "local" | "tecnica" | "area" | "cores";
export type SpotSelection = Partial<Record<LevelKey, string>> & { fromId?: string };
export type SpotLevel = { key: LevelKey; label: string; values: Array<{ value: string; label: string }>; selected: string };

const LEVELS: Array<{ key: LevelKey; label: string }> = [
  { key: "componente", label: "Componente" },
  { key: "local", label: "Local" },
  { key: "tecnica", label: "Técnica" },
  { key: "area", label: "Área" },
  { key: "cores", label: "Nº de cores" },
];

export function coresLabel(cores: number): string {
  if (cores >= 8) return `Até ${cores} cores`; // impressão colorida (ex.: transfer digital)
  return cores === 1 ? "1 cor" : `${cores} cores`;
}

const valueOf = (option: SpotPickable, key: LevelKey) => (key === "cores" ? String(option.cores) : option[key].trim());

/** "9,5 × 5 cm" → área em cm² (mm convertido) para ordenar do menor para o maior. */
function areaSize(label: string): number {
  const numbers = (label.match(/[\d.,]+/g) ?? []).map((n) => Number(n.replace(/\./g, "").replace(",", ".")));
  const [w = 0, h = 0] = numbers;
  const factor = /mm/i.test(label) ? 0.01 : 1;
  return w * h * factor;
}

function sortValues(key: LevelKey, values: string[]): string[] {
  if (key === "cores") return [...values].sort((a, b) => Number(a) - Number(b));
  if (key === "area") return [...values].sort((a, b) => areaSize(a) - areaSize(b));
  if (key === "tecnica") return [...values].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return values; // componente e local: ordem do fornecedor
}

export function spotChoices(options: SpotPickable[], selection: SpotSelection): { levels: SpotLevel[]; option: SpotPickable | null } {
  const start = selection.fromId ? options.find((option) => option.id === selection.fromId) : undefined;
  const preferred = start ?? options.find((option) => option.padrao) ?? options[0];
  let pool = options;
  const levels: SpotLevel[] = [];

  for (const { key, label } of LEVELS) {
    const distinct = [...new Set(pool.map((option) => valueOf(option, key)))];
    const values = sortValues(key, distinct);
    if (values.length === 1 && values[0] === "") continue; // nível sem informação
    const wanted = selection[key] ?? (preferred ? valueOf(preferred, key) : undefined);
    const fallback = pool.find((option) => option.padrao) ? valueOf(pool.find((option) => option.padrao)!, key) : values[0];
    const chosen = wanted !== undefined && values.includes(wanted) ? wanted : values.includes(fallback) ? fallback : values[0];
    levels.push({ key, label, values: values.map((value) => ({ value, label: key === "cores" ? coresLabel(Number(value)) : value })), selected: chosen });
    pool = pool.filter((option) => valueOf(option, key) === chosen);
  }
  return { levels, option: pool[0] ?? null };
}
