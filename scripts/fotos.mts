// Verifica agora as fotos dos produtos à venda: npm run fotos
// (o site já faz isso sozinho uma vez por dia; foto que não abre esconde a cor/produto até voltar).
import { getCatalogDatabase, readCatalogProducts } from "../src/lib/xbzCatalogRepository";
import { readSupplierProducts } from "../src/lib/suppliers/catalog";
import { readBrokenImages, runImageCheck } from "../src/lib/imageHealth";

const database = getCatalogDatabase();
const products = [...readCatalogProducts(database), ...readSupplierProducts(database)].filter((product) => product.stockAvailable > 0);
const started = Date.now();
const result = await runImageCheck(database, products.map((product) => product.imageUrl));
console.log(`${result.checked} fotos verificadas em ${((Date.now() - started) / 1000).toFixed(0)} s; ${result.broken} não abrem.`);
const broken = readBrokenImages(database);
for (const product of products.filter((item) => broken.has(item.imageUrl))) {
  console.log(`- ${product.name} · ${product.primaryColor || "cor única"} (${product.supplier ?? "xbz"})`);
}
