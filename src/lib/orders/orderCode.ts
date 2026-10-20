/**
 * Número curto do pedido para o cliente citar (ex.: #PED-3F7A2C). Derivado do id interno,
 * então é estável; o id completo continua sendo a chave no banco.
 */
export function orderCode(id: string): string {
  return `PED-${id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
}
