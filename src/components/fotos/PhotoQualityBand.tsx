// faixa sobre a qualidade da revelação, logo abaixo dos preços na página da revelação.
import Image from "next/image";
import { Check } from "lucide-react";
import "./qualidade.css";

const POINTS = [
  "Papel fotográfico Fujifilm, brilho ou fosco",
  "Revelação química, como nos laboratórios tradicionais",
  "Mais de 100 anos de vida, se bem armazenada*",
];

export function PhotoQualityBand() {
  return (
    <section className="quality-band" aria-labelledby="quality-band-title">
      {/* Mesma grade da parte de cima da página: o texto alinha com a coluna dos preços e a foto com a foto do produto. */}
      <div className="container-shell product-detail-grid quality-band-grid">
        <div className="product-gallery quality-band-gallery">
          <span aria-hidden="true" />
          <div className="quality-band-media">
            <Image
              alt="Mãos de uma avó e de uma criança segurando juntas uma foto de família revelada, ao lado de um álbum aberto"
              fill
              sizes="(max-width: 860px) 100vw, 34vw"
              src="/images/revelacao-quimica-fujifilm.webp"
            />
          </div>
        </div>
        <div className="quality-band-text">
          <span className="eyebrow">Revelação química Fujifilm</span>
          <h2 id="quality-band-title">Feita para atravessar gerações.</h2>
          <p>
            Cada foto é revelada no processo químico tradicional, em papel fotográfico Fujifilm, com o mesmo cuidado que
            os bons laboratórios dedicam às fotografias há décadas. As cores ficam vivas, os tons de pele, naturais, e os
            detalhes, nítidos, do jeito que você viu naquele dia.
          </p>
          <p>
            Bem guardada, uma foto revelada dura mais de 100 anos. Tempo de sobra para que filhos, netos e bisnetos
            segurem nas mãos o que você está vivendo agora.
          </p>
          <ul>
            {POINTS.map((point) => (
              <li key={point}><Check aria-hidden="true" size={18} />{point}</li>
            ))}
          </ul>
          <small>*Longe da luz do sol, do calor e da umidade, de preferência em álbum ou porta-retrato.</small>
        </div>
      </div>
    </section>
  );
}
