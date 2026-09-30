/** CPF, CNPJ (incluindo o alfanumérico da Receita, a partir de 2026), CEP e telefone. */

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const cnpjChars = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, "");

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length: number) => {
    const sum = [...cpf.slice(0, length)].reduce((acc, digit, index) => acc + Number(digit) * (length + 1 - index), 0);
    return ((sum * 10) % 11) % 10;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

/** Letras valem (código ASCII − 48), como define a Receita para o CNPJ alfanumérico. */
export function isValidCnpj(value: string): boolean {
  const cnpj = cnpjChars(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...cnpj.slice(0, length)].reduce((acc, char, index) => acc + (char.charCodeAt(0) - 48) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

function mask(value: string, pattern: string) {
  let result = "";
  let index = 0;
  for (const slot of pattern) {
    if (index >= value.length) break;
    if (slot === "#") result += value[index++];
    else result += slot;
  }
  return result;
}

export const formatCpf = (value: string) => mask(onlyDigits(value).slice(0, 11), "###.###.###-##");
export const formatCnpj = (value: string) => mask(cnpjChars(value).slice(0, 14), "##.###.###/####-##");
export const formatCep = (value: string) => mask(onlyDigits(value).slice(0, 8), "#####-###");

/** (11) 98888-7777 / (19) 3333-4444 */
export function formatPhoneBR(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${digits.slice(0, 2)}) ${rest}`;
  const split = rest.length === 9 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

export function isBrazilianPhone(value: string) {
  const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, "");
  return /^[1-9]{2}\d{8,9}$/.test(digits);
}

export const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
