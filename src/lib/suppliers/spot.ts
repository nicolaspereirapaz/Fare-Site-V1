import type { Product } from "@/lib/xbz";
import { spotSpecs } from "@/lib/productSpecs";
import { categoryWithHints, decimal, fetchJson, plainText, text } from "./shared";

/**
 * Spot (Spot Gifts Brasil, da empresa Stricker) — webservice REST.
 * Autenticação: AuthenticateClient?accessKey → token de sessão. Catálogo em 3 chamadas:
 * products (dados do modelo), optionals (um item por cor/SKU com foto e preço) e stocks (quantidade por SKU).
 */
export const SPOT_IMAGE_BASE = "https://www.spotgifts.com.br/fotos/produtos/";

type Raw = Record<string, unknown>;

/** "TISANA. Copo para viagem…" / "11110. Caneta…" → sem o código/linha do começo. */
export function spotDisplayName(name: string): string {
  const match = name.match(/^([A-Z0-9ÀÁÂÃÉÊÍÓÔÕÚÇ][A-Z0-9ÀÁÂÃÉÊÍÓÔÕÚÇ' /-]{0,30})\.\s+(.+)$/);
  return match && match[1] === match[1].toLocaleUpperCase("pt-BR") ? match[2].trim() : name.trim();
}

function image(file: unknown) {
  const name = text(file);
  if (!name) return "";
  return /^https?:\/\//.test(name) ? name : SPOT_IMAGE_BASE + name;
}

export function normalizeSpotCatalog(products: Raw[], optionals: Raw[], stocks: Raw[]): Product[] {
  const byReference = new Map(products.map((product) => [text(product.ProdReference), product]));
  const stockBySku = new Map(stocks.map((stock) => [text(stock.Sku), decimal(stock.Quantity) ?? 0]));
  const result: Product[] = [];

  for (const optional of optionals) {
    const reference = text(optional.ProdReference);
    const product = byReference.get(reference);
    if (!product) continue;
    const sku = text(optional.Sku);
    const name = spotDisplayName(text(product.Name));
    if (!name) continue;
    const description = plainText(product.ShortDescription) || plainText(product.Description);
    const price = decimal(optional.YourPrice) ?? decimal(optional.Price1);
    const stock = stockBySku.get(sku) ?? stockBySku.get(text(optional.WebSku)) ?? 0;
    const imageUrl = image(optional.OptionalImage1) || image(product.MainImage);
    if (!imageUrl) continue;

    result.push({
      id: `spot:${sku}`,
      sku,
      compoundCode: sku,
      familyCode: `spot:${reference}`,
      supplier: "spot",
      name,
      description,
      specs: spotSpecs(product),
      productUrl: "",
      imageUrl,
      // As categorias da loja são as nossas: classifica pelo nome/descrição, nunca pela do fornecedor.
      category: categoryWithHints(name, description, [text(product.SubType), text(product.Type)]),
      subcategory: "",
      primaryColor: text(optional.ColorDesc1),
      secondaryColor: text(optional.ColorDesc2),
      price,
      formattedPrice: price === null ? "" : price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      clearance: text(product.IsStockOut) === "True",
      stockMain: stock,
      stockAvailable: stock,
      reliability: "",
      restockDate: "",
    });
  }
  return result;
}

function listOf(payload: unknown, key: string, label: string): Raw[] {
  const value = payload && typeof payload === "object" ? (payload as Raw)[key] : undefined;
  if (!Array.isArray(value)) {
    const error = payload && typeof payload === "object" ? text((payload as Raw).ErrorMessage) : "";
    throw new Error(`Spot: ${label} sem a lista "${key}"${error ? ` (${error})` : ""}.`);
  }
  return value.filter((item): item is Raw => Boolean(item) && typeof item === "object");
}

export function spotConfigured() {
  return Boolean(process.env.SPOT_ACCESS_KEY);
}

export async function fetchSpotProducts(): Promise<Product[]> {
  const accessKey = process.env.SPOT_ACCESS_KEY;
  const base = (process.env.SPOT_BASE_URL ?? "https://ws.spotgifts.com.br/api/v1SSL").replace(/\/$/, "");
  if (!accessKey) throw new Error("Configure SPOT_ACCESS_KEY no arquivo .env.local.");

  const auth = await fetchJson(`${base}/AuthenticateClient?accessKey=${encodeURIComponent(accessKey)}`, {}, "Spot (login)", 30_000) as Raw;
  const token = text(auth.Token);
  if (!token) throw new Error("Spot recusou a chave de acesso.");

  const url = (endpoint: string) => `${base}/${endpoint}?token=${encodeURIComponent(token)}&lang=PT`;
  try {
    const [products, optionals, stocks] = await Promise.all([
      fetchJson(url("products"), {}, "Spot (produtos)"),
      fetchJson(url("optionals"), {}, "Spot (cores)"),
      fetchJson(url("stocks"), {}, "Spot (estoque)"),
    ]);
    return normalizeSpotCatalog(
      listOf(products, "Products", "produtos"),
      listOf(optionals, "Optionals", "cores"),
      listOf(stocks, "Stocks", "estoque"),
    );
  } finally {
    void fetch(`${base}/CloseSession?token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => undefined);
  }
}
