// peças da home que junta os dois públicos — fotos (pessoas e famílias) e brindes (empresas).
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, Building2, Camera, Clock, FileCheck2, Gift, GraduationCap, Heart, MessageCircle, Printer,
} from "lucide-react";
import { DoorSpotlight, type DoorProduct } from "./DoorSpotlight";
import { GRAFICA_HREF, GRAFICA_ITEMS, graficaWhatsApp } from "./grafica";
import "./home.css";

const PHOTO_HREF = "/produtos/revelacao-de-fotos";

/** Topo da home: um título que abraça tudo e três portas, uma para cada parte da loja. */
export function HomeDoors({ products, badge, totalLabel, whatsAppUrl }: { products: DoorProduct[]; badge: string | null; totalLabel: string; whatsAppUrl: string }) {
  return (
    <section className="home-doors" aria-labelledby="home-doors-title">
      <div className="container-shell">
        <div className="home-doors-head">
          <span className="eyebrow">Fare Foto · Jundiaí</span>
          <h1 id="home-doors-title">Suas fotos, seus impressos, sua marca.</h1>
          <p>Revelação de fotos, gráfica e brindes personalizados, feitos com o cuidado de quem imprime memórias.</p>
        </div>
        <div className="home-doors-grid">
          <article className="home-door home-door-fotos">
            <div className="home-door-copy">
              <span className="home-door-tag"><Camera aria-hidden="true" size={15} /> Fotos</span>
              <h2>Suas fotos reveladas em 1 hora.</h2>
              <p>Revelação química Fujifilm, ampliações e grandes formatos. Envie do celular e retire na loja.</p>
              <div className="home-door-actions">
                <Link className="button button-primary" href={PHOTO_HREF}>Enviar minhas fotos</Link>
                <Link className="text-link" href={`${PHOTO_HREF}#tamanhos`}>Tamanhos e preços <ArrowRight aria-hidden="true" size={16} /></Link>
              </div>
            </div>
            <div className="home-door-media home-door-media-fotos">
              <Image alt="Fotos reveladas lado a lado, do 10x15 ao 30x45" fill priority sizes="(max-width: 860px) 100vw, 32vw" src="/images/revelacao/03-escala-tamanhos.webp" />
            </div>
          </article>

          <article className="home-door home-door-grafica">
            <div className="home-door-copy">
              <span className="home-door-tag"><Printer aria-hidden="true" size={15} /> Gráfica & Impressos</span>
              <h2>Impressos que causam boa impressão.</h2>
              <p>Cartões de visita, panfletos, banners, convites, tags e adesivos para o seu negócio ou a sua festa.</p>
              <div className="home-door-actions">
                <Link className="button button-primary" href={GRAFICA_HREF}>Ver impressos</Link>
                <a className="text-link" href={graficaWhatsApp()} rel="noreferrer" target="_blank">Orçamento rápido <ArrowRight aria-hidden="true" size={16} /></a>
              </div>
            </div>
            <div className="home-door-media home-door-media-grafica">
              <DoorSpotlight
                products={GRAFICA_ITEMS.map((item) => ({ id: item.id, name: item.title, category: item.title, imageUrl: item.image, href: `${GRAFICA_HREF}#${item.id}` }))}
                remote={false}
                shape="square"
              />
            </div>
          </article>

          <article className="home-door home-door-brindes">
            <div className="home-door-copy">
              <span className="home-door-tag"><Building2 aria-hidden="true" size={15} /> Brindes</span>
              <h2>Brindes com a sua marca.</h2>
              <p>{totalLabel} para equipes, clientes e eventos. A gente confere a arte e combina valor e prazo.</p>
              <div className="home-door-actions">
                <Link className="button button-primary" href="/brindes">Ver brindes</Link>
                <a className="text-link" href={whatsAppUrl} rel="noreferrer" target="_blank">Falar com a equipe <ArrowRight aria-hidden="true" size={16} /></a>
              </div>
            </div>
            <div className="home-door-media home-door-media-brindes">
              <DoorSpotlight badge={badge} products={products} ringText="Sua marca • seus brindes • Fare Foto • Sua marca • seus brindes • Fare Foto •" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

/** Diferenciais que valem para os dois públicos. */
export function HomeRibbon() {
  return (
    <section className="service-ribbon" aria-label="Diferenciais da Fare Foto">
      <div className="container-shell service-ribbon-grid">
        <div><Heart aria-hidden="true" /><span><strong>Feito com cuidado</strong> do arquivo ao acabamento</span></div>
        <div><FileCheck2 aria-hidden="true" /><span><strong>Tudo conferido</strong> antes de imprimir</span></div>
        <div><MessageCircle aria-hidden="true" /><span><strong>Atendimento humano</strong> do pedido à entrega</span></div>
      </div>
    </section>
  );
}

const PHOTO_CARDS = [
  { tipo: "revelacao", title: "Revelação", sizes: "9 × 12 a 15 × 21 cm", note: "Pronto em 1 hora", tag: "10 × 15 cm", image: "/images/revelacao/02-mao-segurando-fotos.webp" },
  { tipo: "ampliacao", title: "Ampliações", sizes: "20 × 20 a 30 × 45 cm", note: "Pronto em 1 hora", tag: "30 × 45 cm", image: "/images/revelacao/04-ampliacao-30x45-parede.webp" },
  { tipo: "grande", title: "Grandes formatos", sizes: "30 × 60 até 60 × 250 cm", note: "3 dias úteis", tag: "60 × 90 cm", image: "/images/revelacao/05-grande-formato-60x90.webp" },
];

/** "Para você": os produtos de foto, com a mesma cara dos cards de categoria. */
export function HomeParaVoce() {
  return (
    <section className="section-space home-para-voce" id="fotos">
      <div className="container-shell">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Fotos</span>
            <h2>Fotos para guardar, presentear e pendurar.</h2>
          </div>
          <Link className="text-link" href={PHOTO_HREF}>Enviar minhas fotos <ArrowRight aria-hidden="true" size={18} /></Link>
        </div>
        <div className="home-photo-grid">
          {PHOTO_CARDS.map((card) => (
            <Link className="home-photo-card" href={`${PHOTO_HREF}?tipo=${card.tipo}`} key={card.title}>
              <span className="home-photo-media">
                <Image alt="" fill sizes="(max-width: 640px) 90vw, 30vw" src={card.image} />
                <span className="home-photo-size">{card.tag}</span>
              </span>
              <span className="home-photo-copy">
                <strong>{card.title}</strong>
                <small>{card.sizes}</small>
                <small className="home-photo-note"><Clock aria-hidden="true" size={14} /> {card.note}</small>
              </span>
            </Link>
          ))}
          <div className="home-photo-card home-photo-soon">
            <Gift aria-hidden="true" size={28} />
            <strong>Em breve</strong>
            <small>Álbuns, quadros, porta-retratos e presentes com foto.</small>
          </div>
        </div>
      </div>
    </section>
  );
}

const OCCASIONS = [
  { icon: Gift, title: "Natal e fim de ano", now: true, fotos: "Fotos e ampliações para presentear a família", impressos: "Cartões de Natal e tags para os presentes", brindes: "Kits de fim de ano para a equipe e os clientes", brindesHref: "/brindes?categoria=Kits%20Executivos" },
  { icon: Heart, title: "Casamentos e aniversários", fotos: "As fotos da festa reveladas e ampliadas", impressos: "Convites, cardápios e tags das lembrancinhas", brindes: "Lembrancinhas personalizadas para os convidados", brindesHref: "/brindes?categoria=Canecas%2C%20Copos%20e%20Ta%C3%A7as" },
  { icon: GraduationCap, title: "Formaturas", fotos: "Ampliações da turma e do grande dia", impressos: "Convites e banners da formatura", brindes: "Canecas, garrafas e camisetas da turma", brindesHref: "/brindes?categoria=Garrafas%20e%20Squeezes" },
  { icon: Building2, title: "Eventos da empresa", fotos: "Fotos da confraternização para o mural", impressos: "Banners, panfletos e cartões de visita", brindes: "Brindes com a sua marca para todo mundo", brindesHref: "/brindes" },
];

/** "Ocasiões": o ponto em que os dois públicos se encontram — cada data leva às fotos e aos brindes. */
export function HomeOcasioes() {
  return (
    <section className="section-space home-ocasioes" id="ocasioes">
      <div className="container-shell">
        <div className="section-heading centered-heading">
          <span className="eyebrow">Ocasiões</span>
          <h2>Uma data, tudo impresso num lugar só.</h2>
          <p>Fotos para quem você ama, impressos para a festa e brindes para quem trabalha com você.</p>
        </div>
        <div className="home-occasion-grid">
          {OCCASIONS.map(({ icon: Icon, ...item }) => (
            <article className={item.now ? "home-occasion now" : "home-occasion"} key={item.title}>
              {item.now ? <span className="home-occasion-now">Época agora</span> : null}
              <span className="home-occasion-icon"><Icon aria-hidden="true" size={22} /></span>
              <h3>{item.title}</h3>
              <Link className="home-occasion-link" href={PHOTO_HREF}>
                <Camera aria-hidden="true" size={16} />
                <span><small>Fotos</small>{item.fotos}</span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="home-occasion-link" href={GRAFICA_HREF}>
                <Printer aria-hidden="true" size={16} />
                <span><small>Impressos</small>{item.impressos}</span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="home-occasion-link" href={item.brindesHref}>
                <Gift aria-hidden="true" size={16} />
                <span><small>Brindes</small>{item.brindes}</span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** "Gráfica & Impressos": os impressos com foto da loja e um atalho para a lista completa. */
export function HomeGrafica() {
  return (
    <section className="section-space home-grafica" id="grafica">
      <div className="container-shell">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Gráfica & Impressos</span>
            <h2>Do cartão de visita ao banner.</h2>
          </div>
          <Link className="text-link" href={GRAFICA_HREF}>Ver todos os impressos <ArrowRight aria-hidden="true" size={18} /></Link>
        </div>
        <div className="home-photo-grid home-grafica-grid">
          {GRAFICA_ITEMS.slice(0, 4).map((item) => (
            <Link className="home-photo-card" href={`${GRAFICA_HREF}#${item.id}`} key={item.id}>
              <span className="home-photo-media home-grafica-media"><Image alt="" fill sizes="(max-width: 640px) 45vw, 22vw" src={item.image} /></span>
              <span className="home-photo-copy">
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
            </Link>
          ))}
        </div>
        <ul className="home-grafica-more">
          {GRAFICA_ITEMS.slice(4).map(({ icon: Icon, ...item }) => (
            <li key={item.id}><Link href={`${GRAFICA_HREF}#${item.id}`}><Icon aria-hidden="true" size={18} /> {item.title}</Link></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
