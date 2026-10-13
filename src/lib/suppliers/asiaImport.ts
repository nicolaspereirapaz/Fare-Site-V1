import type { Product } from "@/lib/xbz";
import { categoryWithHints, decimal, fetchJson, plainText, readableColor, text } from "./shared";

/**
 * Asia Import — API da Hangar Digital.
 * POST form-urlencoded em https://api.asiaimport.com.br/ com api_key, secret_key e funcao=listarProdutos2,
 * paginado (máx. 100 por página). Cada produto-pai tem "variacoes" (cor) com estoque e foto próprios.
 * (Enviar os parâmetros na URL não funciona: a API responde "Chave e Segredo da API são obrigatórios".)
 */
type Raw = Record<string, unknown>;

function isActive(value: unknown) {
  return value === true || value === 1 || text(value).toLowerCase() === "true" || text(value) === "1";
}

function color(variant: Raw) {
  const attributes = variant.atributos;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return "";
  const cor = (attributes as Raw).cor;
  return cor && typeof cor === "object" ? readableColor((cor as Raw).name) : "";
}

export function normalizeAsiaProducts(products: Raw[]): Product[] {
  const result: Product[] = [];
  for (const product of products) {
    if (!isActive(product.status)) continue;
    const reference = text(product.referencia);
    const name = plainText(product.nome);
    if (!name) continue;
    const hints = product.categorias && typeof product.categorias === "object" ? Object.values(product.categorias as Raw).map(plainText) : [];
    const description = plainText(product.descricao);
    const parentPrice = decimal(product.preco);
    const allVariants = (Array.isArray(product.variacoes) ? (product.variacoes as Raw[]) : [])
      .filter((variant) => variant && typeof variant === "object");
    // Quando há cores com sufixo (GA9130-AZ…), a linha com o código do próprio produto (GA9130) é o
    // total do estoque (soma das cores, preço 0) e não uma cor. Produto de cor única só tem essa linha.
    const hasColorRows = allVariants.some((variant) => text(variant.referencia) && text(variant.referencia) !== reference);
    const variants = hasColorRows ? allVariants.filter((variant) => text(variant.referencia) !== reference) : allVariants;

    for (const variant of variants) {
      if (!variant || typeof variant !== "object" || !isActive(variant.status)) continue;
      const sku = text(variant.referencia) || reference;
      const price = decimal(variant.preco) ?? parentPrice;
      const stock = decimal(variant.qtd_estoque) ?? 0;
      const imageUrl = text(variant.imagem) || text(product.imagem);
      if (!imageUrl) continue;
      result.push({
        id: `asia:${sku}`,
        sku,
        compoundCode: sku,
        familyCode: `asia:${reference}`,
        supplier: "asia",
        name,
        description,
        productUrl: "",
        imageUrl,
        // As categorias da loja são as nossas: classifica pelo nome/descrição, nunca pela do fornecedor.
        category: categoryWithHints(name, description, hints),
        subcategory: "",
        primaryColor: color(variant),
        secondaryColor: "",
        price,
        formattedPrice: price === null ? "" : price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        clearance: false,
        stockMain: stock,
        stockAvailable: stock,
        reliability: "",
        restockDate: "",
      });
    }
  }
  return result;
}

export function asiaConfigured() {
  return Boolean(process.env.ASIA_API_KEY && process.env.ASIA_SECRET_KEY);
}

export async function fetchAsiaProducts(): Promise<Product[]> {
  const apiKey = process.env.ASIA_API_KEY;
  const secretKey = process.env.ASIA_SECRET_KEY;
  const base = process.env.ASIA_BASE_URL ?? "https://api.asiaimport.com.br/";
  if (!apiKey || !secretKey) throw new Error("Configure ASIA_API_KEY e ASIA_SECRET_KEY no arquivo .env.local.");

  const all: Raw[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const body = new URLSearchParams({
      api_key: apiKey, secret_key: secretKey, funcao: "listarProdutos2", por_pagina: "100", pagina: String(page), status: "true",
    });
    const payload = await fetchJson(base, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    }, "Asia Import", 60_000) as Raw;
    if (!Array.isArray(payload.produtos)) throw new Error(`Asia Import: ${text(payload.msg) || "resposta sem produtos"}.`);
    all.push(...(payload.produtos as Raw[]));
    totalPages = Math.min(Number(payload.total_paginas) || 1, 50);
    page += 1;
    if (page <= totalPages) await new Promise((resolve) => setTimeout(resolve, 500));
  } while (page <= totalPages);

  return normalizeAsiaProducts(all);
}
