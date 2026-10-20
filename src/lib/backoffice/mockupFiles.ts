import path from "node:path";

/** Mockups feitos pela equipe (foto do produto editada com a arte). Ficam em data/, fora do deploy. */
// turbopackIgnore: pasta de dados lida em tempo de execução; sem isso o build copia o projeto inteiro para o pacote.
export const MOCKUPS_DIR = process.env.FARE_MOCKUPS_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "mockups");
const URL_PREFIX = "/api/backoffice/mockups/";
const FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export const isMockupFile = (file: string) => FILE.test(file);
export const mockupUrl = (file: string) => `${URL_PREFIX}${file}`;
export const mockupPath = (file: string) => path.join(/* turbopackIgnore: true */ MOCKUPS_DIR, file);

/** Arquivo no disco de uma URL de mockup; null quando a URL não é de mockup. */
export function mockupFileOf(url: string | null | undefined): string | null {
  if (!url?.startsWith(URL_PREFIX)) return null;
  const file = url.slice(URL_PREFIX.length);
  return isMockupFile(file) ? mockupPath(file) : null;
}
