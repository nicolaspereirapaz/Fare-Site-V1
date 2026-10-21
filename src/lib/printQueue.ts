import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/*
 * Fila de impressão da loja: o site grava a comanda como imagem (PNG 300 dpi, uma por página) e o oraculo,
 * que está ao lado da impressora, busca a fila a cada poucos segundos e imprime (gaveta 1, 148,5 × 210 mm).
 */
export const PRINT_DIR = process.env.FARE_PRINT_DIR || path.join(process.cwd(), "data", "impressao");
const run = promisify(execFile);

/** Coloca um PDF na fila. Devolve quantas páginas entraram. Sem pdftoppm no servidor: erro claro. */
export async function queuePdfForPrinting(pdf: Uint8Array, name: string, dir = PRINT_DIR): Promise<number> {
  await mkdir(dir, { recursive: true });
  // Monta numa pasta temporária e só depois move: o oraculo nunca pega imagem pela metade.
  const work = await mkdtemp(path.join(dir, ".tmp-"));
  try {
    const safe = name.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40) || "comanda";
    const base = `${Date.now()}-${safe}`;
    await writeFile(path.join(work, "doc.pdf"), pdf);
    try {
      await run("pdftoppm", ["-r", "300", "-png", path.join(work, "doc.pdf"), path.join(work, base)], { timeout: 60_000 });
    } catch (error) {
      throw new Error((error as NodeJS.ErrnoException).code === "ENOENT" ? "Impressão direta não configurada neste servidor (falta pdftoppm)." : "Não foi possível preparar a impressão.");
    }
    const pages = (await readdir(work)).filter((file) => file.endsWith(".png")).sort();
    for (const page of pages) await rename(path.join(work, page), path.join(dir, page));
    return pages.length;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
