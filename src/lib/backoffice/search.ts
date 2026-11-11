const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Busca do quadro e da Retirada: nome do cliente ou empresa, número ("PED-0012" ou "12") ou produto, sem acento. */
export function matchesSearch(entry: { code: string; customerName: string; customerCompany?: string | null; items: Array<{ productName: string }> }, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const text = fold([entry.code, entry.customerName, entry.customerCompany ?? "", ...entry.items.map((item) => item.productName)].join(" "));
  return words.every((word) => text.includes(word));
}
