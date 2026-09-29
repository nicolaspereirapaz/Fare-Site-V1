/**
 * Exporta a seleção Outubro Rosa do banco local (SQLite) para a landing page estática.
 *
 * Só sai informação pública: nome, descrição, categoria, fotos, cores, preço "a partir de"
 * e os parâmetros de preço já com a margem (preço de venda por unidade + frete a ratear).
 * Não sai custo do fornecedor, código interno, SKU, estoque nem nome do fornecedor.
 * As fotos são baixadas, redimensionadas (WebP 800px) e salvas junto da landing page,
 * para o site publicado não depender nem revelar o CDN do fornecedor.
 *
 * Uso:  npm run export:landing -- <pasta da landing page>
 *       (gera <pasta>/outubro-rosa/data/products.json e <pasta>/outubro-rosa/img/produtos/*.webp)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const load = (relative: string) => import(pathToFileURL(path.join(root, relative)).href);
const sharp = createRequire(import.meta.url)("sharp");

const { OUTUBRO_ROSA_PRODUCT_CODES } = await load("src/data/outubroRosaProducts.ts");
const { selectCampaignProducts } = await load("src/lib/campaignProducts.ts");
const { groupAvailableProducts } = await load("src/lib/xbz.ts");
const { getCatalogDatabase, readCatalogProducts, catalogProductCount } = await load("src/lib/xbzCatalogRepository.ts");
const { toPublicCatalogProduct } = await load("src/lib/publicCatalog.ts");
const { withCampaignFeaturedColor } = await load("src/lib/campaignColors.ts");
const { campaignQuantityPricing, campaignStartingPrice } = await load("src/lib/campaignPricing.ts");

const landingDir = process.argv[2];
if (!landingDir || !existsSync(path.join(landingDir, "index.html"))) {
  console.error("Informe a pasta da landing page (a que tem o index.html). Ex.: npm run export:landing -- ../landing-page-fare-foto");
  process.exit(1);
}
const campaignDir = path.resolve(landingDir, "outubro-rosa");
const imageDir = path.join(campaignDir, "img", "produtos");
const destination = path.join(campaignDir, "data", "products.json");

const database = getCatalogDatabase();
if (catalogProductCount(database) === 0) {
  console.error("Banco local vazio: abra o site uma vez (npm run dev) para a carga inicial.");
  process.exit(1);
}

const selected = selectCampaignProducts(groupAvailableProducts(readCatalogProducts(database)), OUTUBRO_ROSA_PRODUCT_CODES);

// Nome de arquivo estável e sem pistas do fornecedor: hash da URL de origem.
const localName = (url: string) => `${createHash("sha256").update(`farefoto:img:${url}`).digest("hex").slice(0, 16)}.webp`;
const localPath = (url: string) => (url ? `img/produtos/${localName(url)}` : "");

type ExportedProduct = {
  id: string; name: string; description: string; category: string; image: string;
  variants: Array<{ id: string; label: string; image: string }>;
  startingPrice: number | null; pricing: { unitSaleCents: number; freightCents: number } | null;
};

const products: ExportedProduct[] = selected.map((product: Parameters<typeof toPublicCatalogProduct>[0]) => {
  const publicProduct = withCampaignFeaturedColor(toPublicCatalogProduct(product));
  return {
    id: publicProduct.publicId,
    name: publicProduct.name,
    description: publicProduct.description,
    category: publicProduct.category,
    image: publicProduct.imageUrl as string,
    variants: publicProduct.variants.map((variant: { publicId: string; label: string; imageUrl?: string }) => ({
      id: variant.publicId,
      label: variant.label,
      image: (variant.imageUrl || publicProduct.imageUrl) as string,
    })),
    startingPrice: campaignStartingPrice(product),
    pricing: campaignQuantityPricing(product),
  };
});

// Baixa e converte as fotos (8 por vez); as que falharem ficam sem imagem (a página mostra o aviso).
mkdirSync(imageDir, { recursive: true });
const sources: string[] = [...new Set(products.flatMap((p) => [p.image, ...p.variants.map((v) => v.image)]).filter(Boolean))];
const saved = new Set<string>();
let cursor = 0;
let failed = 0;
async function worker() {
  while (cursor < sources.length) {
    const url = sources[cursor++];
    const file = path.join(imageDir, localName(url));
    if (existsSync(file)) { saved.add(url); continue; }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const input = Buffer.from(await response.arrayBuffer());
      await sharp(input).rotate().resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(file);
      saved.add(url);
    } catch {
      failed += 1;
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

for (const product of products) {
  product.image = saved.has(product.image) ? localPath(product.image) : "";
  for (const variant of product.variants) variant.image = saved.has(variant.image) ? localPath(variant.image) : product.image;
}

// Remove fotos de produtos que saíram da seleção.
const keep = new Set([...saved].map(localName));
for (const file of readdirSync(imageDir)) if (file.endsWith(".webp") && !keep.has(file)) rmSync(path.join(imageDir, file));

// Garantia extra: nenhum campo interno pode vazar para o arquivo público.
const serialized = JSON.stringify({ generatedAt: new Date().toISOString(), products }, null, 0);
for (const forbidden of ['"price"', "internalCode", '"sku"', "compoundCode", "familyCode", '"stock"', "xbz", "XBZ"]) {
  if (serialized.includes(forbidden)) {
    console.error(`Abortado: campo interno "${forbidden}" encontrado na exportação.`);
    process.exit(1);
  }
}

mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, serialized);
console.log(`${products.length} produtos exportados para ${destination}`);
console.log(`${saved.size} fotos em ${imageDir}${failed ? ` (${failed} falharam)` : ""}`);
