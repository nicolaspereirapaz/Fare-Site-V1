import { redirect } from "next/navigation";

/**
 * Lançamento só com brindes: o catálogo de produtos próprios (fotos, álbuns, gráfica) fica guardado em
 * src/data/products.ts e volta numa próxima etapa. Até lá, quem acessa /produtos vai para os brindes.
 */
export default async function ProductsPage(): Promise<never> {
  redirect("/brindes");
}
