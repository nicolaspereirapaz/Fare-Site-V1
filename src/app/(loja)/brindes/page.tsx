import type { Metadata } from "next";
import { XbzCatalog } from "@/components/XbzCatalog";

export const metadata: Metadata = {
  title: "Brindes personalizados",
  description:
    "Brindes personalizados para empresas, eventos, equipes e ocasiões especiais.",
};

export default function BrindesPage() {
  return (
    <>
      <section className="page-hero catalog-hero">
        <div className="container-shell">
          <span className="eyebrow">Brindes para sua empresa</span>
          <h1>Brindes que levam sua marca mais longe.</h1>
          <p>
            Encontre produtos para sua empresa, evento ou equipe e monte uma solicitação de
            orçamento personalizada com a Fare Foto.
          </p>
        </div>
      </section>
      <section className="catalog-section">
        <div className="container-shell">
          <XbzCatalog />
        </div>
      </section>
    </>
  );
}
