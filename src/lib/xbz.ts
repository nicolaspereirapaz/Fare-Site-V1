export type Product = {
  id: string;
  sku: string;
  compoundCode: string;
  familyCode: string;
  name: string;
  description: string;
  productUrl: string;
  imageUrl: string;
  category: string;
  subcategory: string;
  primaryColor: string;
  secondaryColor: string;
  price: number | null;
  formattedPrice: string;
  clearance: boolean;
  stockMain: number;
  stockAvailable: number;
  reliability: string;
  restockDate: string;
};

export type CatalogProduct = {
  id: string;
  internalCode: string;
  name: string;
  description: string;
  productUrl: string;
  imageUrl: string;
  category: string;
  subcategory: string;
  price: number | null;
  formattedPrice: string;
  totalStock: number;
  colors: string[];
  variants: Product[];
};

export type ProductsResponse = {
  products: CatalogProduct[];
  categories?: Array<{ name: string; count: number }>;
  meta: {
    total: number;
    page: number;
    limit: number;
    fetchedAt: string;
    cached: boolean;
  };
};

type RawProduct = Record<string, unknown>;
type ProductCache = { products: Product[]; fetchedAt: string; expiresAt: number };

const CACHE_TTL_MS = 5 * 60 * 1000;

const globalCache = globalThis as typeof globalThis & {
  xbzProductCache?: ProductCache;
  xbzProductRequest?: Promise<ProductCache>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function boolean(value: unknown): boolean {
  return value === true || value === 1 || text(value).toLowerCase() === "true";
}

export function sentenceCaseProductName(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  return normalized ? normalized[0].toLocaleUpperCase("pt-BR") + normalized.slice(1) : "";
}

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b(caneca|copo|taca|xicara)\b/, "Canecas e copos"],
  [/\b(mochila|bolsa|sacola|necessaire|pochete|pasta executiva)\b/, "Bolsas e mochilas"],
  [/\b(squeeze|garrafa|cantil|termica)\b/, "Garrafas e squeezes"],
  [/\b(caderno|bloco|agenda|caneta|lapiseira|marca-texto|estojo)\b/, "Papelaria e escritório"],
  [/\b(chaveiro)\b/, "Chaveiros"],
  [/\b(camiseta|camisa|bone|avental|colete)\b/, "Vestuário"],
  [/\b(fone|carregador|cabo|mouse|teclado|caixa de som|power bank|pen drive|usb)\b/, "Tecnologia"],
  [/\b(guarda-chuva|mala|almofada de viagem|travesseiro de viagem)\b/, "Viagem"],
  [/\b(ferramenta|trena|lanterna|canivete)\b/, "Ferramentas"],
  [/\b(kit vinho|saca-rolha|abridor|tabua|talher|porta-copo)\b/, "Casa e cozinha"],
];

export function inferCategory(name: string, suppliedCategory: string): string {
  if (suppliedCategory.trim()) return suppliedCategory.trim();
  const normalizedName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  return CATEGORY_RULES.find(([pattern]) => pattern.test(normalizedName))?.[1] ?? "Outros";
}

export function normalizeProduct(raw: RawProduct): Product {
  const id = text(raw.IdProduto ?? raw.id ?? raw.Id);
  const sku = text(raw.CodigoXbz ?? raw.codigoXbz);
  const name = text(raw.Nome ?? raw.nome ?? raw.Descricao ?? raw.descricao) || "Produto sem nome";
  const suppliedCategory = text(raw.WebTipo ?? raw.webTipo);

  return {
    id: id || sku || text(raw.CodigoComposto ?? raw.codigoComposto),
    sku,
    compoundCode: text(raw.CodigoComposto ?? raw.codigoComposto),
    familyCode: text(raw.CodigoAmigavel ?? raw.codigoAmigavel),
    name,
    description: text(raw.Descricao ?? raw.descricao),
    productUrl: text(raw.SiteLink ?? raw.siteLink),
    imageUrl: text(raw.ImageLink ?? raw.imageLink),
    category: inferCategory(name, suppliedCategory),
    subcategory: text(raw.WebSubTipo ?? raw.webSubTipo),
    primaryColor: text(raw.CorWebPrincipal ?? raw.corWebPrincipal),
    secondaryColor: text(raw.CorWebSecundaria ?? raw.corWebSecundaria),
    price: number(raw.PrecoVenda ?? raw.precoVenda),
    formattedPrice: text(raw.PrecoVendaFormatado ?? raw.precoVendaFormatado),
    clearance: boolean(raw.PontaDeEstoque ?? raw.pontaDeEstoque),
    stockMain: number(raw.QuantidadeDisponivelEstoquePrincipal ?? raw.quantidadeDisponivelEstoquePrincipal) ?? 0,
    stockAvailable: number(raw.QuantidadeDisponivel ?? raw.quantidadeDisponivel) ?? 0,
    reliability: text(raw.StatusConfiabilidade ?? raw.statusConfiabilidade),
    restockDate: text(raw.ReposicaoDataPrevista ?? raw.reposicaoDataPrevista),
  };
}

export function normalizeProducts(payload: unknown): Product[] {
  let records: unknown = payload;
  if (typeof records === "string") {
    try {
      records = JSON.parse(records);
    } catch {
      throw new Error("A XBZ retornou os produtos como texto inválido.");
    }
  }
  if (!Array.isArray(records) && records && typeof records === "object") {
    const wrapper = records as Record<string, unknown>;
    records = wrapper.data ?? wrapper.produtos ?? wrapper.Produtos
      ?? Object.values(wrapper).find(Array.isArray);
  }
  if (!Array.isArray(records)) throw new Error("A XBZ retornou um formato de produtos não reconhecido.");
  return records.filter((item): item is RawProduct => Boolean(item) && typeof item === "object").map(normalizeProduct);
}

export function groupAvailableProducts(products: Product[]): CatalogProduct[] {
  const groups = new Map<string, Product[]>();

  for (const product of products) {
    if (product.stockAvailable <= 0) continue;
    const internalCode = product.familyCode || product.compoundCode || product.sku || product.id;
    const variants = groups.get(internalCode) ?? [];
    variants.push(product);
    groups.set(internalCode, variants);
  }

  return Array.from(groups, ([internalCode, variants]) => {
    const representative = variants[0];
    const colors = Array.from(new Set(
      variants.flatMap((variant) => [variant.primaryColor, variant.secondaryColor]).filter(Boolean),
    ));
    const lowestPriced = variants
      .filter((variant) => variant.price !== null)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0] ?? representative;

    return {
      id: internalCode,
      internalCode,
      name: representative.name,
      description: representative.description,
      productUrl: representative.productUrl,
      imageUrl: representative.imageUrl,
      category: representative.category,
      subcategory: representative.subcategory,
      price: lowestPriced.price,
      formattedPrice: lowestPriced.formattedPrice,
      totalStock: variants.reduce((total, variant) => total + variant.stockAvailable, 0),
      colors,
      variants,
    };
  });
}

function configuration() {
  const cnpj = process.env.XBZ_CNPJ;
  const token = process.env.XBZ_TOKEN;
  const baseUrl = process.env.XBZ_BASE_URL ?? "https://api.minhaxbz.com.br:5001/api/clientes";
  const productsPath = process.env.XBZ_PRODUCTS_PATH ?? "GetListaDeProdutos";

  if (!cnpj || !token) throw new Error("Configure XBZ_CNPJ e XBZ_TOKEN no arquivo .env.local.");
  return { cnpj, token, baseUrl, productsPath };
}

async function requestProducts(): Promise<ProductCache> {
  const { cnpj, token, baseUrl, productsPath } = configuration();
  const url = new URL(productsPath, `${baseUrl.replace(/\/$/, "")}/`);
  const headers = new Headers({ Accept: "application/json" });

  if (productsPath.toLowerCase().includes("produtoslistar")) {
    headers.set("cnpj", cnpj);
    headers.set("token", token);
  } else {
    url.searchParams.set("cnpj", cnpj);
    url.searchParams.set("token", token);
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "CNPJ ou token rejeitado pela XBZ.",
      403: "Limite diário da XBZ atingido ou acesso bloqueado.",
      500: "A XBZ encontrou um erro interno.",
    };
    throw new Error(messages[response.status] ?? `A XBZ respondeu com HTTP ${response.status}.`);
  }

  const body = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("A XBZ retornou uma resposta que não é JSON válido.");
  }

  const fetchedAt = new Date().toISOString();
  return {
    products: normalizeProducts(payload),
    fetchedAt,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

export async function getProducts(forceRefresh = false) {
  if (!forceRefresh && globalCache.xbzProductCache && globalCache.xbzProductCache.expiresAt > Date.now()) {
    return { ...globalCache.xbzProductCache, cached: true };
  }

  if (!globalCache.xbzProductRequest) {
    globalCache.xbzProductRequest = requestProducts().then((result) => {
      globalCache.xbzProductCache = result;
      return result;
    }).finally(() => {
      globalCache.xbzProductRequest = undefined;
    });
  }

  const result = await globalCache.xbzProductRequest;
  return { ...result, cached: false };
}
