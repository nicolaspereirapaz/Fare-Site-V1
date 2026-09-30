import { redirect } from "next/navigation";

// A conta abre direto em "Pedidos"; cada seção tem sua página no menu lateral.
export default function AccountPage() {
  redirect("/minha-conta/pedidos");
}
