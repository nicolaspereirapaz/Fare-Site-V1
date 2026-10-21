import { documentNumberOf, formatDocumentNumber } from "@/lib/documentNumber";

/**
 * Número do pedido para o cliente citar (ex.: #PED-0001). Vindo de orçamento, é o mesmo número do ORC.
 * Pedidos antigos (id sem número) continuam com o código derivado do id (ex.: #PED-3F7A2C).
 */
export function orderCode(id: string): string {
  const n = documentNumberOf(id);
  return n === null ? `PED-${id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}` : `PED-${formatDocumentNumber(n)}`;
}
