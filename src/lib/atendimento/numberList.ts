/**
 * Lista de números como na impressora: "1-5, 8, 10-12".
 * Separa por vírgula, ponto e vírgula ou espaço; faixa com "-" ou "a" ("3 a 7"). Faixa invertida vale ("9-4").
 * Números fora de 1..max são ignorados (max limita também faixas enormes).
 */
export function parseNumberList(text: string, max: number): Set<number> {
  const numbers = new Set<number>();
  const parts = text.toLowerCase().replace(/\s*(?:-|–|\ba\b|\bat[eé])\s*/g, "-").split(/[\s,;]+/);
  for (const part of parts) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) continue;
    const a = Number(match[1]);
    const b = match[2] === undefined ? a : Number(match[2]);
    const low = Math.max(1, Math.min(a, b));
    const high = Math.min(max, Math.max(a, b));
    for (let n = low; n <= high; n += 1) numbers.add(n);
  }
  return numbers;
}

/** Números -> texto compacto em faixas: [1,2,3,5,7,8] -> "1-3, 5, 7-8". */
export function formatNumberList(numbers: Iterable<number>): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length; ) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    parts.push(end === index ? String(sorted[index]) : `${sorted[index]}-${sorted[end]}`);
    index = end + 1;
  }
  return parts.join(", ");
}
