/**
 * Arrastar cartões no quadro (estilo Trello): ao soltar numa coluna, o cartão passa por cada
 * etapa do caminho, uma a uma, para o histórico e as regras de transição continuarem valendo.
 * Sem dependências de servidor (usado nas telas).
 */

/** Etapas a gravar, em ordem, de `from` até `to`; [] se é a mesma coluna; null se algum passo não é permitido. */
export function movePath<S extends string>(columns: readonly S[], from: S, to: S, can: (from: S, to: S) => boolean): S[] | null {
  const start = columns.indexOf(from);
  const end = columns.indexOf(to);
  if (start < 0 || end < 0) return null;
  if (start === end) return [];
  const direction = end > start ? 1 : -1;
  const path: S[] = [];
  let current = from;
  for (let index = start + direction; direction > 0 ? index <= end : index >= end; index += direction) {
    const next = columns[index];
    if (!can(current, next)) return null;
    path.push(next);
    current = next;
  }
  return path;
}

/** Colunas para onde o cartão pode ir (inclui a atual), na ordem do quadro. */
export function reachableColumns<S extends string>(columns: readonly S[], from: S, can: (from: S, to: S) => boolean): S[] {
  return columns.filter((column) => movePath(columns, from, column, can) !== null);
}
