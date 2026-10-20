import Image from "next/image";
import Link from "next/link";
import { Camera, MapPin, MessageCircle } from "lucide-react";
import { FARE_FOTO_INSTAGRAM, FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { buildWhatsAppUrl } from "@/lib/commerce";

export function Footer() {
  const whatsAppUrl = buildWhatsAppUrl(
    FARE_FOTO_WHATSAPP,
    "Olá! Gostaria de conhecer os produtos da Fare Foto.",
  );

  return (
    <footer className="site-footer">
      <div className="container-shell footer-grid">
        <div className="footer-brand">
          <Image alt="Fare Foto" height={87} src="/images/fare-foto-logo-escuro.svg" width={200} />
          <p>Brindes personalizados para empresas, equipes e eventos, com a sua marca e atendimento de perto.</p>
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/brindes">Todos os brindes</Link>
          <Link href="/#categorias">Categorias</Link>
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/#contato">Fale com a gente</Link>
        </div>
        <div>
          <h2>Atendimento</h2>
          <a href={whatsAppUrl} rel="noreferrer" target="_blank">
            <MessageCircle aria-hidden="true" size={17} /> WhatsApp
          </a>
          <a href={FARE_FOTO_INSTAGRAM} rel="noreferrer" target="_blank">
            <Camera aria-hidden="true" size={17} /> Instagram
          </a>
          <span><MapPin aria-hidden="true" size={17} /> Jundiaí, SP</span>
        </div>
      </div>
      <div className="container-shell footer-bottom">
        <span>© {new Date().getFullYear()} Fare Foto. Todos os direitos reservados.</span>
        <span>Catálogo em versão inicial · valores confirmados no atendimento. · <Link href="/privacidade">Política de privacidade</Link></span>
      </div>
    </footer>
  );
}
