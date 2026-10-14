/**
 * Grupos de cor do filtro da busca de produto da equipe (referência: brinde.me).
 * Cada cor do fornecedor entra no grupo da sua cor PRINCIPAL (a primeira antes da "/"):
 * "Azul (tom 2)", "Azul Royal" e "Azul / Prata" → Azul. Sem dependência de servidor (o navegador usa).
 */
export type ColorGroup = { name: string; swatch: string };

export const COLOR_GROUPS: readonly ColorGroup[] = [
  { name: "Amarelo", swatch: "#f4cf2c" },
  { name: "Azul", swatch: "#2457c5" },
  { name: "Azul claro", swatch: "#6cb7ea" },
  { name: "Bambu", swatch: "linear-gradient(135deg, #e3c88f, #c09a57)" },
  { name: "Bege", swatch: "#e3d3b5" },
  { name: "Bordô", swatch: "#7d1f33" },
  { name: "Branco", swatch: "#ffffff" },
  { name: "Chumbo", swatch: "#4a4d53" },
  { name: "Cinza", swatch: "#8e9196" },
  { name: "Cobre e bronze", swatch: "linear-gradient(135deg, #f0a77a, #b5653a)" },
  { name: "Colorido", swatch: "conic-gradient(#e94b4b, #f4b63d, #4cb860, #3b8fe0, #9b5bd8, #e94b4b)" },
  { name: "Dourado", swatch: "linear-gradient(135deg, #f6e08a, #c69a2d 55%, #f0d77a)" },
  { name: "Inox", swatch: "linear-gradient(135deg, #eceff2, #9ea4ab 55%, #d9dde1)" },
  { name: "Kraft", swatch: "#c3a073" },
  { name: "Laranja", swatch: "#f2782c" },
  { name: "Madeira", swatch: "linear-gradient(135deg, #c99a63, #9b6a3b)" },
  { name: "Marrom", swatch: "#7a4a2a" },
  { name: "Natural", swatch: "#eadfc8" },
  { name: "Prata", swatch: "linear-gradient(135deg, #f1f2f4, #a9adb4 55%, #e3e5e8)" },
  { name: "Preto", swatch: "#1f1f22" },
  { name: "Rosa", swatch: "#f08bb4" },
  { name: "Roxo", swatch: "#7a46b8" },
  { name: "Transparente", swatch: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(214,226,236,0.7))" },
  { name: "Verde", swatch: "#2e9d57" },
  { name: "Verde claro", swatch: "#8fd19e" },
  { name: "Vermelho", swatch: "#d6312b" },
  { name: "Outras", swatch: "#c9c6c1" },
];

export const OTHER_COLOR_GROUP = "Outras";
const LIGHT = new Set(["Branco", "Transparente", "Bege", "Natural", "Prata", "Inox"]);

/** Ordem importa: o primeiro prefixo que casar decide (\"azul claro\" antes de \"azul\"). */
const RULES: Array<[string, RegExp]> = [
  ["Azul claro", /^(azul (claro|aqua|pastel|ciano|bebe)|turquesa)/],
  ["Azul", /^azul/],
  ["Verde claro", /^(verde (claro|agua|turquesa|limao)|kiwi)/],
  ["Verde", /^(verde|oliva)/],
  ["Amarelo", /^(amarelo|milho)/],
  ["Bordô", /^(bordo|vinho|marsala)/],
  ["Vermelho", /^(vermelho|cereja)/],
  ["Rosa", /^(rosa|salmao|pessego|pink)/],
  ["Roxo", /^(roxo|lilas|lavanda|violeta)/],
  ["Laranja", /^laranja/],
  ["Marrom", /^(marrom|marron|cafe|camel|cha$|chocolate|caramelo)/],
  ["Natural", /^(natural|cru|reciclado)/],
  ["Bege", /^(bege|creme|off white|champanhe|areia)/],
  ["Branco", /^branco/],
  ["Preto", /^preto/],
  ["Chumbo", /^chumbo/],
  ["Cinza", /^(cinza|grafite|fume)/],
  ["Prata", /^(prata|cromado)/],
  ["Inox", /^inox/],
  ["Dourado", /^dourado/],
  ["Cobre e bronze", /^(cobre|bronze)/],
  ["Transparente", /^transparente/],
  ["Colorido", /^(colorido|sortido|multicolor)/],
  ["Madeira", /^madeira/],
  ["Bambu", /^bambu/],
  ["Kraft", /^kraft/],
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

/** "Azul Royal / Prata (tom 2)" → "Azul"; cor desconhecida → "Outras". */
export function colorGroupOf(label: string): string {
  const main = normalize(label.replace(/\s*\(tom \d+\)\s*$/i, "").split("/")[0] ?? "");
  return RULES.find(([, pattern]) => pattern.test(main))?.[0] ?? OTHER_COLOR_GROUP;
}

export function colorGroupSwatch(name: string): { background: string } {
  return { background: COLOR_GROUPS.find((group) => group.name === name)?.swatch ?? "#c9c6c1" };
}

export function isLightColorGroup(name: string) {
  return LIGHT.has(name);
}
