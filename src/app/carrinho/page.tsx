import type { Metadata } from "next";
import { CartView } from "@/components/CartView";

export const metadata: Metadata = {
  title: "Carrinho de orçamento",
  description: "Revise seus produtos e envie o pedido de orçamento para a Fare Foto pelo WhatsApp.",
};

export default function CartPage() {
  return (
    <section className="cart-page">
      <div className="container-shell"><CartView /></div>
    </section>
  );
}
