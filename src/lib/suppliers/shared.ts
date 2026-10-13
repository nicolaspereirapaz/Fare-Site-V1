import { classifyProduct, normalizeCategoryText, type ProductCategory } from "@/lib/productCategories";

/** Utilidades comuns aos adaptadores de fornecedor (somente servidor). */

/**
 * Pistas da categoria do fornecedor → uma das categorias DA LOJA (a lista não muda).
 * Só é usada quando as regras da loja (nome e descrição) não decidem e o produto cairia em "Outros".
 */
const HINT_RULES: Array<[ProductCategory, RegExp]> = [
  ["Churrasco, Vinho e Queijo", /barbecue|churrasco|vinho|saca rolha|drink|tabuas? de cozinha/],
  ["Casa e Cozinha", /cozinha|restauracao|utensilio|travessa|prato|cha cafe|cafe|aventa|pegas|velas|mantas?|casa/],
  ["Bolsas Térmicas e Marmitas", /termic|marmita/],
  ["Mochilas", /mochila/],
  ["Viagem e Lazer", /viagem|mala|trolley|guarda chuva|guarda sol|capas? de chuva|praia|verao|sol chuva|panama|chapeus de palha|ar livre/],
  ["Necessaires e Estojos", /cosmetico|necessaire|estojo/],
  ["Beleza e Bem-estar", /manicur|maquilh|espelho|escova|comprimido|banho|alcool gel|pessoa/],
  ["Bolsas e Sacolas", /saco|sacola|bolsa|compras/],
  ["Garrafas e Squeezes", /garrafa|squeeze|termos|shaker/],
  ["Canecas, Copos e Taças", /caneca|copo|xicara|taca/],
  ["Canetas e Lápis", /esferografica|caneta|lapis|roller|escrita|colorir|giz/],
  ["Cadernos e Agendas", /caderno|agenda|bloco|notas adesivas|papelaria/],
  ["Escritório", /escritorio|secretaria|pasta|porta cart|lanyard|cracha|placa/],
  ["Chaveiros", /chaveiro|porta chaves/],
  ["Ferramentas", /ferramenta|canivete|navalha|lanterna|automovel/],
  ["Tecnologia", /tecnologia|carregador|telemovel|notebook|pc tablet|usb|eletronic/],
  ["Vestuário e Acessórios", /t shirt|camiseta|bone|chapeu|moda|textil|colete|chinelo/],
  ["Esporte e Fitness", /esporte|desporto|bola|reflector|refletor/],
  ["Infantil e Diversão", /crianca|escolar|anti estress|jogo|cartas/],
  ["Embalagens para Presente", /embalage|caixa/],
  ["Pet", /animais|pet/],
];

export function categoryWithHints(name: string, description: string, hints: string[]): string {
  const own = classifyProduct(name, description);
  if (own !== "Outros") return own;
  const hint = normalizeCategoryText(hints.filter(Boolean).join(" "));
  if (!hint) return own;
  for (const [category, pattern] of HINT_RULES) if (pattern.test(hint)) return category;
  return own;
}

export function text(value: unknown): string {
  if (value == null) return "";
  const result = typeof value === "string" ? value : String(value);
  return result === "None" || result === "null" ? "" : result.trim();
}

export function decimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Remove HTML e decodifica as entidades mais comuns ("&amp;" → "&"). */
export function plainText(value: unknown): string {
  return text(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (match, entity: string) => ENTITIES[entity.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

/** "azul-claro" → "Azul Claro"; "cafe-2" → "Café". */
export function readableColor(value: unknown): string {
  const raw = text(value).replace(/-\d+$/, "").replace(/[-_]+/g, " ").trim();
  if (!raw) return "";
  const accents: Record<string, string> = { cafe: "café", lilas: "lilás", pessego: "pêssego", cha: "chá", fume: "fumê", agua: "água", oliva: "oliva" };
  return raw
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word) => accents[word] ?? word)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1))
    .join(" ");
}

export async function fetchJson(url: URL | string, init: RequestInit, label: string, timeoutMs = 120_000): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${label} respondeu com HTTP ${response.status}.`);
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} retornou uma resposta que não é JSON válido.`);
  }
}
