// Resolve "@/..." e imports sem extensão (convenções do Next) para rodar scripts .mts no Node puro.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function withExtension(filePath) {
  for (const candidate of [filePath, `${filePath}.ts`, `${filePath}.tsx`, path.join(filePath, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
      try { if (!existsSync(candidate) || candidate === filePath && !/\.[cm]?[tj]sx?$/.test(candidate)) continue; } catch { continue; }
      return candidate;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let target = null;
  if (specifier.startsWith("@/")) target = path.join(src, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (target) {
    const found = withExtension(target);
    if (found) return nextResolve(pathToFileURL(found).href, context);
  }
  return nextResolve(specifier, context);
}
