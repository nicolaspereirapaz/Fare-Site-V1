import type { Metadata } from "next";
import { OutubroRosaCart } from "@/components/OutubroRosaCart";

export const metadata: Metadata = {
  title: "Carrinho | Outubro Rosa",
  description: "Revise os brindes escolhidos e envie o pedido de orçamento pelo WhatsApp.",
};

export default function OutubroRosaCartPage() {
  return <OutubroRosaCart />;
}
