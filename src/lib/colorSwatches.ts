/**
 * Amostra visual de cada cor do fornecedor (as 23 que aparecem no catálogo XBZ).
 * Metais e materiais ganham um degradê para parecerem o material; "Colorido" vira um arco-íris.
 */
const SWATCHES: Record<string, string> = {
  preto: "#1f1f22",
  azul: "#2457c5",
  branco: "#ffffff",
  verde: "#2e9d57",
  vermelho: "#d6312b",
  rosa: "#f08bb4",
  cinza: "#8e9196",
  prata: "linear-gradient(135deg, #f1f2f4, #a9adb4 55%, #e3e5e8)",
  laranja: "#f2782c",
  roxo: "#7a46b8",
  bege: "#e3d3b5",
  amarelo: "#f4cf2c",
  transparente: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(214,226,236,0.7))",
  marrom: "#7a4a2a",
  colorido: "conic-gradient(#e94b4b, #f4b63d, #4cb860, #3b8fe0, #9b5bd8, #e94b4b)",
  inox: "linear-gradient(135deg, #eceff2, #9ea4ab 55%, #d9dde1)",
  madeira: "linear-gradient(135deg, #c99a63, #9b6a3b)",
  dourado: "linear-gradient(135deg, #f6e08a, #c69a2d 55%, #f0d77a)",
  kraft: "#c3a073",
  chumbo: "#4a4d53",
  bambu: "linear-gradient(135deg, #e3c88f, #c09a57)",
  cobre: "linear-gradient(135deg, #f0a77a, #b5653a)",
  bronze: "linear-gradient(135deg, #d6a46a, #8c5a2b)",
};

const UNKNOWN = "#c9c6c1";

function normalize(name: string) {
  return name
    .replace(/\s*\(tom \d+\)\s*$/i, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function single(name: string) {
  return SWATCHES[normalize(name)] ?? UNKNOWN;
}

/** Cor sólida usada na metade de uma bolinha bicolor (degradês viram o tom do meio). */
function solid(name: string) {
  const value = single(name);
  if (!value.includes("gradient")) return value;
  return value.match(/#[0-9a-f]{6}/gi)?.[1] ?? value.match(/#[0-9a-f]{6}/i)?.[0] ?? UNKNOWN;
}

/** "Azul" → cor; "Azul / Branco" → bolinha meio a meio. */
export function swatchFor(label: string): { background: string } {
  const parts = label.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { background: `linear-gradient(135deg, ${solid(parts[0])} 50%, ${solid(parts[1])} 50%)` };
  return { background: single(parts[0] ?? label) };
}

/** Cores muito claras precisam de contorno para não sumirem no fundo branco. */
export function isLightSwatch(label: string) {
  return ["branco", "transparente", "bege", "prata", "inox"].includes(normalize(label.split("/")[0] ?? label));
}
