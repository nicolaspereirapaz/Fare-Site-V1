import { redirect } from "next/navigation";

/** Lançamento só com brindes: páginas de produtos próprios levam ao catálogo de brindes. */
export default async function ProductPage(): Promise<never> {
  redirect("/brindes");
}
