import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileCheck2, Heart, MessageCircle, Palette, PackageCheck, Sparkles } from "lucide-react";
import { ContactForm } from "@/components/ContactForm";
import { HeroCarousel } from "@/components/HeroCarousel";
import { ProductCard } from "@/components/ProductCard";
import { featuredProducts, products } from "@/data/products";

const categories = [
  { name: "Fotografias, álbuns e molduras", image: "/images/revelacao-fotos.webp", description: "Revelações, fotoálbuns, quadros e porta-retratos" },
  { name: "Brindes para sua empresa", image: "/images/brindes-corporativos.webp", description: "Canecas, copos, camisetas e kits personalizados" },
  { name: "Gráfica", image: "/images/cartao-visita.webp", description: "Cartões, folders, tags e adesivos" },
];

export default function Home() {
  return (
    <>
      <HeroCarousel />

      <section className="service-ribbon" aria-label="Diferenciais do atendimento">
        <div className="container-shell service-ribbon-grid">
          <div><Heart aria-hidden="true" /><span><strong>Feito com cuidado</strong> do arquivo ao acabamento</span></div>
          <div><FileCheck2 aria-hidden="true" /><span><strong>Arte conferida</strong> antes da produção</span></div>
          <div><MessageCircle aria-hidden="true" /><span><strong>Atendimento humano</strong> para fechar os detalhes</span></div>
        </div>
      </section>

      <section className="section-space" id="categorias">
        <div className="container-shell">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">Explore por categoria</span>
              <h2>Tudo o que você imagina, impresso.</h2>
            </div>
            <p>Da memória afetiva à comunicação da sua empresa, encontre um ponto de partida para o seu projeto.</p>
          </div>

          <div className="category-grid">
            {categories.map((category) => {
              const count = products.filter((product) => product.category === category.name).length;
              return (
                <Link
                  className="category-card"
                  href={`/produtos?categoria=${encodeURIComponent(category.name)}`}
                  key={category.name}
                >
                  <Image alt="" fill sizes="(max-width: 760px) 100vw, 33vw" src={category.image} />
                  <span className="category-overlay" />
                  <span className="category-copy">
                    <small>{count} {count === 1 ? "produto" : "produtos"}</small>
                    <strong>{category.name}</strong>
                    <span>{category.description}</span>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section-space featured-section">
        <div className="container-shell">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">Produtos em destaque</span>
              <h2>Comece por aqui.</h2>
            </div>
            <Link className="text-link" href="/produtos">Ver catálogo completo <ArrowRight aria-hidden="true" size={18} /></Link>
          </div>
          <div className="product-grid home-product-grid">
            {featuredProducts.map((product) => <ProductCard key={product.slug} product={product} />)}
          </div>
        </div>
      </section>

      <section className="editorial-section">
        <div className="container-shell editorial-grid">
          <article className="editorial-card editorial-memory">
            <Image alt="Fotoálbum personalizado da Fare Foto" fill sizes="(max-width: 800px) 100vw, 50vw" src="/images/fotoalbum.webp" />
            <div className="editorial-content">
              <Sparkles aria-hidden="true" />
              <span>Para guardar histórias</span>
              <h2>Transforme fotos em presença.</h2>
              <Link href="/produtos?categoria=Fotografias%2C%20%C3%A1lbuns%20e%20molduras">Ver fotografias e álbuns <ArrowRight aria-hidden="true" /></Link>
            </div>
          </article>
          <article className="editorial-card editorial-brand">
            <Image alt="Camiseta personalizada produzida pela Fare Foto" fill sizes="(max-width: 800px) 100vw, 50vw" src="/images/camisetas-personalizadas.webp" />
            <div className="editorial-content">
              <Palette aria-hidden="true" />
              <span>Para fortalecer marcas</span>
              <h2>Identidade que vai além da tela.</h2>
              <Link href="/produtos?categoria=Brindes%20para%20sua%20empresa">Soluções para empresas <ArrowRight aria-hidden="true" /></Link>
            </div>
          </article>
        </div>
      </section>

      <section className="section-space process-section" id="como-funciona">
        <div className="container-shell">
          <div className="section-heading centered-heading">
            <span className="eyebrow">Simples e acompanhado</span>
            <h2>Do clique à produção.</h2>
            <p>Você configura o pedido; a equipe confere os detalhes e confirma tudo antes de produzir.</p>
          </div>
          <ol className="process-grid">
            <li><span>01</span><PackageCheck aria-hidden="true" /><h3>Escolha o produto</h3><p>Navegue pelo catálogo e encontre o formato mais próximo do que precisa.</p></li>
            <li><span>02</span><Palette aria-hidden="true" /><h3>Configure e envie a arte</h3><p>Selecione materiais, tamanhos, acabamento, quantidade e identifique seu arquivo.</p></li>
            <li><span>03</span><MessageCircle aria-hidden="true" /><h3>Finalize no WhatsApp</h3><p>Receba a confirmação de valor, prazo, retirada ou entrega com uma pessoa da equipe.</p></li>
          </ol>
        </div>
      </section>

      <ContactForm />
    </>
  );
}
