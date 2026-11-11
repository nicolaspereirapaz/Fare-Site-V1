/**
 * Arrastar cartões no quadro (estilo Trello): ao soltar numa coluna, o cartão passa por cada
 * etapa do caminho, uma a uma, para o histórico e as regras de transição continuarem valendo.
 * Sem dependências de servidor (usado nas telas).
 */

/**
 * Etapas a gravar, em ordem, de `from` até `to`: o caminho mais curto de transições permitidas entre as colunas
 * (pular colunas passa por cada etapa do meio; uma coluna "paralela", como Produção Externa, só entra no caminho
 * quando é o destino ou não há outro). [] se é a mesma coluna; null se não há caminho.
 */
export function movePath<S extends string>(columns: readonly S[], from: S, to: S, can: (from: S, to: S) => boolean): S[] | null {
  if (!columns.includes(from) || !columns.includes(to)) return null;
  if (from === to) return [];
  // Busca em largura; no empate vence a coluna mais perto da atual (voltar de Finalizado passa por Em produção,
  // vizinha, e não pela Produção Externa).
  const previous = new Map<S, S>([[from, from]]);
  const queue: S[] = [from];
  while (queue.length) {
    const current = queue.shift()!;
    const at = columns.indexOf(current);
    const byDistance = [...columns].sort((a, b) => Math.abs(columns.indexOf(a) - at) - Math.abs(columns.indexOf(b) - at));
    for (const next of byDistance) {
      if (previous.has(next) || !can(current, next)) continue;
      previous.set(next, current);
      if (next === to) {
        const path: S[] = [];
        for (let step: S = to; step !== from; step = previous.get(step)!) path.unshift(step);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Colunas para onde o cartão pode ir (inclui a atual), na ordem do quadro. */
export function reachableColumns<S extends string>(columns: readonly S[], from: S, can: (from: S, to: S) => boolean): S[] {
  return columns.filter((column) => movePath(columns, from, column, can) !== null);
}
