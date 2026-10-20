import { redirect } from "next/navigation";

/** O pedido de fotos agora fica no carrinho único, junto com brindes e impressos. */
export default function PedidoFotosPage(): never {
  redirect("/carrinho");
}
