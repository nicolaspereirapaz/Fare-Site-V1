// lista dos impressos da gráfica, usada no menu, na home e na página /grafica.
// Imagens geradas no Codex (fundo neutro de e-commerce), em public/images/grafica.
import { BookOpen, CreditCard, Flag, Gift, Mail, Newspaper, Sticker, Tag, type LucideIcon } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";

export const GRAFICA_HREF = "/grafica";

export type GraficaItem = { id: string; title: string; text: string; icon: LucideIcon; image: string };

const img = (name: string) => `/images/grafica/${name}.webp`;

// Os 4 primeiros aparecem como cartões na home; os demais, como atalhos logo abaixo.
export const GRAFICA_ITEMS: GraficaItem[] = [
  { id: "cartoes", title: "Cartões de visita", text: "Couché, fosco ou com verniz localizado. A partir de 100 unidades.", icon: CreditCard, image: img("01-cartoes-de-visita") },
  { id: "panfletos", title: "Panfletos e flyers", text: "Para divulgar promoções, eventos e inaugurações.", icon: Newspaper, image: img("02-panfletos-flyers") },
  { id: "banners", title: "Banners e lonas", text: "Roll-up, faixas e lonas para fachada, eventos e ponto de venda.", icon: Flag, image: img("04-banner-lona") },
  { id: "convites", title: "Convites e cardápios", text: "Casamentos, aniversários, batizados, restaurantes e eventos.", icon: Mail, image: img("05-convites-cardapios") },
  { id: "folders", title: "Folders", text: "Dobrados em 2 ou 3 partes, para apresentar o seu negócio.", icon: BookOpen, image: img("03-folders") },
  { id: "tags", title: "Tags", text: "Para roupas, embalagens e presentes, com furo e cordão.", icon: Tag, image: img("06-tags") },
  { id: "adesivos", title: "Adesivos e etiquetas", text: "Redondos, quadrados ou no formato da sua marca.", icon: Sticker, image: img("07-adesivos-etiquetas") },
  { id: "comemorativos", title: "Cartões comemorativos", text: "Natal, Páscoa, Dia das Mães e cartões de agradecimento.", icon: Gift, image: img("08-cartoes-comemorativos") },
];

export const graficaWhatsApp = (item?: string) =>
  buildWhatsAppUrl(FARE_FOTO_WHATSAPP, item ? `Olá! Quero um orçamento de ${item.toLowerCase()}.` : "Olá! Quero um orçamento de impressos.");
