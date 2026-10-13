import { isLightSwatch, swatchFor } from "@/lib/colorSwatches";

function titleCase(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s/-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toLocaleUpperCase("pt-BR"));
}

/** Bolinhas das cores disponíveis (cards do catálogo e da Home). Acima de `max`, mostra "+N". */
export function ColorDots({ colors, max = 6 }: { colors: string[]; max?: number }) {
  const unique = Array.from(new Set(colors.map((color) => titleCase(color.trim())).filter(Boolean)));
  if (!unique.length) return null;
  const shown = unique.slice(0, max);
  const rest = unique.length - shown.length;
  const label = `${unique.length} ${unique.length === 1 ? "cor disponível" : "cores disponíveis"}`;

  return (
    <ul aria-label={label} className="color-dots">
      {shown.map((color) => (
        <li key={color}>
          <span className={`color-dot${isLightSwatch(color) ? " light" : ""}`} style={swatchFor(color)} title={color} />
        </li>
      ))}
      {rest > 0 ? (
        <li aria-hidden="true" className="color-dots-more">
          +{rest}
        </li>
      ) : null}
    </ul>
  );
}
