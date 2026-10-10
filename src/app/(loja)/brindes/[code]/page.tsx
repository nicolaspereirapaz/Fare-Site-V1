import type { Metadata } from "next";
import { XbzProductDetail } from "@/components/XbzProductDetail";

export const metadata: Metadata = {
  title: "Brinde",
  description: "Configuração de brinde corporativo com estoque consultado no fornecedor.",
};

type BrindePageProps = { params: Promise<{ code: string }> };

export default async function BrindePage({ params }: BrindePageProps) {
  const { code } = await params;

  return (
    <section className="product-detail-section">
      <div className="container-shell">
        <XbzProductDetail code={decodeURIComponent(code)} />
      </div>
    </section>
  );
}
