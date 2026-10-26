import type { Metadata } from "next";
import Image from "next/image";
import { OutubroRosaCampaign } from "@/components/OutubroRosaCampaign";
import styles from "./outubro-rosa.module.css";

export const metadata: Metadata = {
  title: "Outubro Rosa | Brindes personalizados",
  description:
    "Uma seleção especial de brindes personalizados para ações de conscientização do Outubro Rosa.",
};

export default function OutubroRosaPage() {
  return (
    <main className={styles.page}>
      <section aria-label="Campanha Outubro Rosa" className={styles.hero}>
        <div className="container-shell">
          <div className={styles.bannerFrame}>
            <Image
              alt="Outubro Rosa — A prevenção é o melhor caminho. Vamos juntos nessa luta contra o câncer de mama."
              className={styles.banner}
              height={728}
              priority
              sizes="(max-width: 768px) 100vw, 1200px"
              src="/images/campanhas/outubro-rosa.png"
              width={2161}
            />
          </div>
        </div>
      </section>

      <section className={styles.intro}>
        <div className="container-shell">
          <h1>Brindes que transformam cuidado em presença.</h1>
          <p>
            Encontre uma seleção especial para campanhas, equipes e eventos. Escolha os produtos,
            personalize seu pedido e solicite o orçamento diretamente pelo WhatsApp.
          </p>
        </div>
      </section>

      <section aria-labelledby="outubro-rosa-produtos" className={styles.catalogSection}>
        <div className="container-shell">
          <OutubroRosaCampaign />
        </div>
      </section>
    </main>
  );
}
