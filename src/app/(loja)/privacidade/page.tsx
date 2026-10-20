import type { Metadata } from "next";
import { CookieChoiceReset } from "@/components/Analytics";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como a Fare Foto usa e protege os seus dados e as suas fotos (LGPD).",
};

const UPDATED = "20 de outubro de 2026";

export default function PrivacyPage() {
  const whatsApp = buildWhatsAppUrl(FARE_FOTO_WHATSAPP, "Olá! Quero falar sobre os meus dados na Fare Foto.");
  return (
    <section className="container-shell legal-page">
      <span className="eyebrow">LGPD</span>
      <h1>Política de privacidade</h1>
      <p className="legal-updated">Atualizada em {UPDATED}.</p>

      <p>A Fare Foto (Jundiaí, SP) cuida dos seus dados e das suas fotos como cuida das impressões: com atenção. Aqui está, em linguagem simples, o que guardamos, por que e por quanto tempo, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

      <h2>O que coletamos</h2>
      <ul>
        <li><strong>Cadastro:</strong> nome completo, e-mail, WhatsApp e senha (guardada embaralhada; nem a equipe consegue ver).</li>
        <li><strong>Pedidos e orçamentos:</strong> os itens escolhidos, quantidades, valores, forma de pagamento, data e horário de retirada ou entrega.</li>
        <li><strong>Fotos e artes enviadas:</strong> os arquivos que você manda para revelar, ampliar ou personalizar.</li>
        <li><strong>Navegação:</strong> só com a sua permissão (veja “Cookies”).</li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li>Produzir, conferir e entregar o seu pedido, e falar com você sobre ele (inclusive pelo WhatsApp).</li>
        <li>Mostrar preços e o histórico na sua conta.</li>
        <li>Cumprir obrigações fiscais e legais.</li>
        <li>Com a sua permissão: medir as visitas e melhorar os nossos anúncios.</li>
      </ul>
      <p>Não vendemos os seus dados. As suas fotos são usadas só para o seu pedido e nunca em divulgação sem a sua autorização.</p>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li><strong>Fornecedores de brindes</strong>, quando o seu pedido precisa ser produzido por eles: só o necessário (a arte e o produto).</li>
        <li><strong>Google (Analytics) e Meta (Pixel)</strong>, apenas se você aceitar os cookies.</li>
        <li><strong>Serviço de e-mail</strong>, para mandar o link de “esqueci minha senha”.</li>
        <li>Autoridades, quando a lei exigir.</li>
      </ul>

      <h2>Por quanto tempo guardamos</h2>
      <ul>
        <li>Fotos enviadas que não viraram pedido: apagadas em até 7 dias.</li>
        <li>Fotos e arquivos de pedidos: guardados para atendimento e novas cópias; você pode pedir para apagar a qualquer momento.</li>
        <li>Dados de pedidos e da conta: enquanto a conta existir e pelo prazo que a lei fiscal exige.</li>
      </ul>

      <h2>Cookies</h2>
      <p>Usamos cookies próprios para manter você conectado e guardar o carrinho; sem eles o site não funciona. Os cookies do Google e da Meta só são ativados se você clicar em “Aceitar” no aviso. Você pode mudar de ideia quando quiser:</p>
      <p><CookieChoiceReset /></p>

      <h2>Os seus direitos</h2>
      <p>Você pode pedir, a qualquer momento: confirmação de que temos dados seus, uma cópia deles, correção, apagamento, e retirar o consentimento dos cookies. É só falar com a gente — respondemos em até 15 dias.</p>
      <p><a className="button button-primary" href={whatsApp} rel="noreferrer" target="_blank">Falar com a Fare Foto pelo WhatsApp</a></p>

      <h2>Segurança</h2>
      <p>O site usa conexão protegida (https), as senhas são guardadas embaralhadas e só a equipe da Fare Foto, com login próprio, acessa os pedidos e as fotos.</p>
    </section>
  );
}
