import { classifyProduct, isInternalSupplierItem, PRODUCT_CATEGORIES } from "./productCategories";

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

// Conectores ficam minúsculos (exceto na primeira palavra): "Copo Térmico com Tampa 500ml".
const NAME_CONNECTORS = new Set([
  "a", "o", "as", "os", "e", "ou", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos",
  "com", "sem", "para", "pra", "por", "pelo", "pela", "ao", "à", "x", "c/", "p/", "s/",
]);
// Siglas conhecidas no catálogo de brindes.
const NAME_ACRONYMS = new Map([
  "usb", "led", "pu", "pvc", "tnt", "rpet", "mdf", "eva", "abs", "tws", "pp", "a4", "a5", "a6",
  "3d", "tv", "gps", "rfid", "nfc", "uv", "ps", "pla", "cob",
].map((item) => [item, item.toLocaleUpperCase("pt-BR")]));
NAME_ACRONYMS.set("leds", "LEDs");

function capitalizeWord(word: string): string {
  const index = word.search(/\p{L}/u);
  if (index < 0) return word;
  return word.slice(0, index) + word[index].toLocaleUpperCase("pt-BR") + word.slice(index + 1);
}

function formatNameWord(word: string, isFirst: boolean): string {
  const core = word.replace(/^[("'“*]+|[)"'”.,:;]+$/g, "");
  const lead = word.slice(0, word.indexOf(core));
  const trail = word.slice(word.indexOf(core) + core.length);

  if (!core) return word;
  if (/^\d/.test(core)) {
    // Medidas: ml minúsculo (500ml), litro com L (14L, 1,2L), GB/mAh no padrão técnico.
    const measured = core.replace(/(\d)(gb|tb|mb)$/, (_, digit: string, unit: string) => digit + unit.toUpperCase())
      .replace(/mah$/, "mAh").replace(/^(\d+)d$/, "$1D").replace(/^([\d.,]+)l$/, "$1L");
    return lead + measured + trail;
  }
  if (NAME_ACRONYMS.has(core)) return lead + NAME_ACRONYMS.get(core) + trail;
  if (/^[cps]\/\S/.test(core)) return lead + core + trail;
  // Palavra aberta por aspas conta como início de frase: "Sem Caneta".
  const startsPhrase = isFirst || /["“]/.test(lead);
  if (!startsPhrase && NAME_CONNECTORS.has(core)) return lead + core + trail;
  return lead + core.split("-").map(capitalizeWord).join("-") + trail;
}

/** Nome de produto em título: "COPO TÉRMICO 500ML" → "Copo Térmico 500ml". */
export function formatProductName(value: string): string {
  const words = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR").split(" ").filter(Boolean);
  return words.map((word, index) => formatNameWord(word, index === 0)).join(" ");
}

/** Categorias antigas, gravadas no banco local antes da reorganização; são recalculadas ao ler. */
const LEGACY_CATEGORIES = new Set([
  "Canecas e copos", "Bolsas e mochilas", "Garrafas e squeezes", "Papelaria e escritório", "Chaveiros",
  "Vestuário", "Tecnologia", "Viagem", "Ferramentas", "Casa e cozinha", "Outros", "PONTA DE ESTOQUE",
]);

export function inferCategory(name: string, suppliedCategory: string, description = ""): string {
  return classifyProduct(name, description, suppliedCategory);
}

function resolveCategory(product: Pick<Product, "name" | "description" | "category">): string {
  if (product.category && !LEGACY_CATEGORIES.has(product.category)) {
    // Categoria válida do fornecedor ou já reclassificada.
    return (PRODUCT_CATEGORIES as readonly string[]).includes(product.category)
      ? classifyProduct(product.name, product.description)
      : product.category;
  }
  return classifyProduct(product.name, product.description);
}

export function normalizeProduct(raw: RawProduct): Product {
  const id = text(raw.IdProduto ?? raw.id ?? raw.Id);
  const sku = text(raw.CodigoXbz ?? raw.codigoXbz);
  const name = text(raw.Nome ?? raw.nome ?? raw.Descricao ?? raw.descricao) || "Produto sem nome";
  const suppliedCategory = text(raw.WebTipo ?? raw.webTipo);
  const description = text(raw.Descricao ?? raw.descricao);

  return {
    id: id || sku || text(raw.CodigoComposto ?? raw.codigoComposto),
    sku,
    compoundCode: text(raw.CodigoComposto ?? raw.codigoComposto),
    familyCode: text(raw.CodigoAmigavel ?? raw.codigoAmigavel),
    name,
    description,
    productUrl: text(raw.SiteLink ?? raw.siteLink),
    imageUrl: text(raw.ImageLink ?? raw.imageLink),
    category: inferCategory(name, suppliedCategory, description),
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
    if (isInternalSupplierItem(product.name)) continue;
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
      category: resolveCategory(representative),
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
