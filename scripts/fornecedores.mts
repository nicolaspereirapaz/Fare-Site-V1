// Sincroniza agora o catálogo dos fornecedores adicionais: npm run fornecedores -- [spot|asia]
import { getCatalogDatabase } from "../src/lib/xbzCatalogRepository";
import { EXTRA_SUPPLIERS, syncSupplier } from "../src/lib/suppliers/catalog";
import { syncSpotCustomizations } from "../src/lib/suppliers/spotCustomizations";

const wanted = process.argv[2];
const list = wanted ? EXTRA_SUPPLIERS.filter((supplier) => supplier === wanted) : EXTRA_SUPPLIERS;
if (!list.length) {
  console.error(`Fornecedor desconhecido: ${wanted}. Use: ${EXTRA_SUPPLIERS.join(", ")}`);
  process.exit(1);
}
const database = getCatalogDatabase();
for (const supplier of list) {
  const started = Date.now();
  try {
    const count = await syncSupplier(database, supplier);
    console.log(`${supplier}: ${count} itens (cores) em ${((Date.now() - started) / 1000).toFixed(1)} s`);
    if (supplier === "spot") {
      const products = await syncSpotCustomizations(database);
      console.log(`spot: personalizações de ${products} produtos`);
    }
  } catch (error) {
    console.error(`${supplier}: falhou — ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
