/**
 * Nomes formatados automaticamente ao salvar.
 * Cliente: "Ana Maria da Silva". Produto: "Caneca de Porcelana com Alça", "Squeeze Alumínio 420ml".
 */

const NAME_CONNECTORS = new Set(["da", "de", "do", "das", "dos", "e"]);
const PRODUCT_CONNECTORS = new Set([
  "a", "o", "as", "os", "e", "ou", "de", "da", "do", "das", "dos", "com", "sem", "em", "na", "no", "nas", "nos",
  "para", "por", "à", "ao", "aos", "às", "c", "s", // "c/" (com), "s/" (sem)
]);
/** Medida logo depois de número fica minúscula: "420ml", "90x120 cm". */
const UNITS = new Set(["cm", "mm", "m", "ml", "l", "g", "kg", "x", "un", "pcs"]);

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

/** Aplica `format` a cada palavra (sequência de letras), sabendo se é a primeira e se vem logo depois de um número. */
function eachWord(text: string, format: (word: string, info: { first: boolean; afterNumber: boolean }) => string) {
  let first = true;
  return text.replace(/\p{L}[\p{L}\p{M}'’]*/gu, (word, offset: number) => {
    const out = format(word, { first, afterNumber: /\d\s?$/.test(text.slice(0, offset)) });
    first = false;
    return out;
  });
}

export function formatPersonName(name: string): string {
  return eachWord(tidy(name).toLocaleLowerCase("pt-BR"), (word, { first }) => (!first && NAME_CONNECTORS.has(word) ? word : capitalize(word)));
}

export function formatProductName(name: string): string {
  const text = tidy(name);
  // Tudo em maiúsculas (catálogo de fornecedor): começa do minúsculo. Senão, mantém siglas digitadas (PVC, DTF).
  const base = /\p{Ll}/u.test(text) ? text : text.toLocaleLowerCase("pt-BR");
  return eachWord(base, (word, { first, afterNumber }) => {
    const lower = word.toLocaleLowerCase("pt-BR");
    if (afterNumber && UNITS.has(lower)) return lower;
    if (!first && PRODUCT_CONNECTORS.has(lower)) return lower;
    return word === lower ? capitalize(word) : word;
  });
}
