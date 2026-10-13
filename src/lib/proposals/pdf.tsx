import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Link, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { brl, proposalReplyLinks, type Proposal } from "@/lib/proposals/proposal";

/** PDF A4 da proposta. Nome do produto é link para a página dele no site. */

const ASSETS = path.join(process.cwd(), "src", "assets");
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: "DM Sans",
    fonts: [
      { src: path.join(ASSETS, "fonts", "dm-sans-latin-400-normal.ttf"), fontWeight: 400 },
      { src: path.join(ASSETS, "fonts", "dm-sans-latin-500-normal.ttf"), fontWeight: 500 },
      { src: path.join(ASSETS, "fonts", "dm-sans-latin-700-normal.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Outfit",
    fonts: [
      { src: path.join(ASSETS, "fonts", "outfit-latin-600-normal.ttf"), fontWeight: 600 },
      { src: path.join(ASSETS, "fonts", "outfit-latin-700-normal.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const C = { navy: "#2B3854", ink: "#1d2447", lilac: "#656FA4", orange: "#F65C2D", line: "#e4e5ea", muted: "#737889", text: "#343a4d", soft: "#f4f5f8" };

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 32, paddingHorizontal: 44, fontFamily: "DM Sans", fontSize: 9.5, color: C.text, lineHeight: 1.4 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 16, borderBottomWidth: 1.5, borderBottomColor: C.navy },
  logo: { width: 96, height: 45 },
  title: { fontFamily: "Outfit", fontWeight: 700, fontSize: 19, lineHeight: 1.2, color: C.ink, textAlign: "right" },
  code: { marginTop: 3, fontSize: 10, lineHeight: 1.3, color: C.muted, textAlign: "right" },
  codeStrong: { color: C.ink, fontWeight: 700 },
  meta: { flexDirection: "row", marginTop: 18, marginBottom: 20 },
  metaCol: { flex: 1.35 },
  metaDates: { flex: 1, flexDirection: "row" },
  date: { flex: 1, backgroundColor: C.soft, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 9, marginLeft: 8 },
  label: { fontSize: 8, color: C.lilac, fontWeight: 700, marginBottom: 4 },
  dateLabel: { fontSize: 8, color: C.muted },
  dateValue: { fontSize: 11, fontWeight: 700, color: C.ink, marginTop: 1 },
  customerName: { fontSize: 11, fontWeight: 700, color: C.ink },
  th: { flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line, fontSize: 8, color: C.muted, fontWeight: 700 },
  row: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 0.75, borderBottomColor: C.line },
  colProd: { flex: 1, flexDirection: "row", paddingRight: 10 },
  colQty: { width: 50, textAlign: "right" },
  /** Colunas de valor: "R$" alinhado à esquerda e o número à direita (formato contábil). */
  colUnit: { width: 70, marginLeft: 26, textAlign: "right" },
  colTotal: { width: 86, marginLeft: 26, textAlign: "right" },
  money: { flexDirection: "row", justifyContent: "space-between" },
  num: { fontFeatureSettings: ["tnum"] },
  thumb: { width: 72, height: 72, objectFit: "contain", borderWidth: 0.75, borderColor: C.line, borderRadius: 6, marginRight: 12 },
  /** Item sem foto: espaço vazio do tamanho da foto, para os nomes ficarem alinhados. */
  thumbSpace: { width: 72, marginRight: 12 },
  /** Empurra condições + WhatsApp para o pé da página. */
  spacer: { flexGrow: 1 },
  prodName: { fontSize: 10.5, fontWeight: 700, color: C.ink, textDecoration: "none" },
  prodLink: { fontSize: 10.5, fontWeight: 700, color: C.navy, textDecoration: "underline" },
  small: { fontSize: 8.5, color: C.muted, marginTop: 1.5 },
  engraving: { fontSize: 8.5, color: C.text, marginTop: 2 },
  unit: { fontWeight: 700, color: C.ink },
  /** Pé da página: condições à esquerda, totais à direita. */
  bottom: { flexDirection: "row", alignItems: "flex-start", borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 12 },
  terms: { flex: 1, paddingRight: 22 },
  term: { flexDirection: "row", marginBottom: 4 },
  termTitle: { width: 92, fontSize: 8.5, fontWeight: 700, color: C.lilac },
  termText: { flex: 1, fontSize: 8.5, color: C.text },
  notice: { marginBottom: 10, alignSelf: "stretch", textAlign: "center", backgroundColor: "#fdeee8", color: "#a93c1a", fontSize: 8.5, fontWeight: 700, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8 },
  totals: { width: 210 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  discountValue: { color: "#167b55", fontWeight: 700 },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: C.navy },
  grandValue: { fontFamily: "Outfit", fontWeight: 700, fontSize: 17, color: C.ink },
  hint: { marginTop: 6, fontSize: 7.5, color: C.muted },
  cta: { marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.ink, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16 },
  ctaTitle: { color: "#fff", fontSize: 11, fontWeight: 700 },
  ctaSub: { color: "#c9cde0", fontSize: 8.5, marginTop: 2 },
  ctaButtons: { flexDirection: "row", alignItems: "center" },
  /** Botões são links inteiros (react-pdf: estilo no Link + Text dentro). */
  btnApprove: { backgroundColor: C.orange, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16, textDecoration: "none" },
  btnTalk: { borderWidth: 1, borderColor: "#8d93b5", borderRadius: 6, paddingVertical: 7, paddingHorizontal: 14, marginLeft: 8, textDecoration: "none" },
  btnText: { color: "#fff", fontSize: 10, fontWeight: 700 },
  foot: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 6 },
});

/** Valor em coluna: "R$" encostado à esquerda, número à direita, dígitos de mesma largura. */
function Money({ value, style }: { value: number; style: Style | Style[] }) {
  const number = brl(value).replace(/^R\$\s*/, "");
  const flat = (Array.isArray(style) ? style : [style]).reduce<Style>((acc, entry) => ({ ...acc, ...entry }), {});
  return (
    <View style={[s.money, { width: flat.width, marginLeft: flat.marginLeft }]}>
      <Text style={[flat, { width: undefined, marginLeft: 0 }]}>R$</Text>
      <Text style={[flat, s.num, { width: undefined, marginLeft: 0 }]}>{number}</Text>
    </View>
  );
}

function ProposalDocument({ proposal, logo }: { proposal: Proposal; logo: string }) {
  const { customer } = proposal;
  const anyPhoto = proposal.items.some((item) => item.imageUrl);
  const links = proposalReplyLinks(proposal);
  return (
    <Document author="Fare Foto" creator="Fare Foto" title={`Proposta ${proposal.code}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logo} style={s.logo} />
          <View>
            <Text style={s.title}>Proposta comercial</Text>
            <Text style={s.code}>Orçamento <Text style={s.codeStrong}>{proposal.code}</Text></Text>
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaCol}>
            <Text style={s.label}>Para</Text>
            <Text style={s.customerName}>{customer.company ?? customer.name}</Text>
            {customer.document ? <Text>{customer.document}</Text> : null}
            <Text>{[customer.company ? customer.name : null, customer.phone].filter(Boolean).join(" · ")}</Text>
            {customer.city ? <Text>{customer.city}</Text> : null}
          </View>
          <View style={s.metaDates}>
            <View style={s.date}><Text style={s.dateLabel}>Emitida em</Text><Text style={s.dateValue}>{proposal.issuedAt}</Text></View>
            <View style={s.date}><Text style={s.dateLabel}>Válida até</Text><Text style={s.dateValue}>{proposal.validUntil}</Text></View>
          </View>
        </View>

        <View style={s.th} fixed>
          <Text style={{ flex: 1 }}>Produto</Text>
          <Text style={s.colQty}>Qtd.</Text>
          <Text style={s.colUnit}>Unitário</Text>
          <Text style={s.colTotal}>Total</Text>
        </View>
        {proposal.items.map((item, index) => (
          <View key={index} style={s.row} wrap={false}>
            <View style={s.colProd}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              {item.imageUrl ? <Image src={item.imageUrl} style={s.thumb} /> : anyPhoto ? <View style={s.thumbSpace} /> : null}
              <View style={{ flex: 1 }}>
                {item.url ? <Link src={item.url} style={s.prodLink}>{item.name}</Link> : <Text style={s.prodName}>{item.name}</Text>}
                {item.code || item.color ? (
                  <Text style={s.small}>{[item.code ? `Cód. ${item.code}` : null, item.color ? `Cor: ${item.color}` : null].filter(Boolean).join(" · ")}</Text>
                ) : null}
                {item.engravings.map((engraving, i) => <Text key={i} style={s.engraving}>Gravação: {engraving}</Text>)}
              </View>
            </View>
            <Text style={[s.colQty, s.num]}>{item.quantity.toLocaleString("pt-BR")}</Text>
            <Money style={[s.colUnit, s.unit]} value={item.unitPrice} />
            <Money style={s.colTotal} value={item.total} />
          </View>
        ))}

        {proposal.items.some((item) => item.url) ? <Text style={s.hint}>Clique no nome do produto para ver fotos e detalhes no site.</Text> : null}

        <View style={s.spacer} />
        <View wrap={false}>
        <View style={s.bottom}>
          <View style={s.terms}>
            {proposal.terms.map((term) => (
              <View key={term.title} style={s.term}>
                <Text style={s.termTitle}>{term.title}</Text>
                <Text style={s.termText}>{term.text}</Text>
              </View>
            ))}
          </View>
          <View style={s.totals}>
            {/* Sinal de 50% no alto da coluna do total (espaço que ficava vazio). */}
            <Text style={s.notice}>{proposal.notice}</Text>
            <View style={s.totalRow}><Text>Subtotal ({proposal.items.length} {proposal.items.length === 1 ? "item" : "itens"})</Text><Text>{brl(proposal.subtotal)}</Text></View>
            {proposal.discount ? (
              <View style={s.totalRow}><Text>{proposal.discount.label}</Text><Text style={s.discountValue}>− {brl(proposal.discount.amount)}</Text></View>
            ) : null}
            <View style={s.totalRow}><Text>Frete</Text><Text>A combinar</Text></View>
            <View style={s.grand}><Text style={{ fontWeight: 700, color: C.ink }}>Total</Text><Text style={s.grandValue}>{brl(proposal.total)}</Text></View>
          </View>
        </View>

        <View style={s.cta}>
          <View>
            <Text style={s.ctaTitle}>Gostou? Aprove pelo WhatsApp.</Text>
            <Text style={s.ctaSub}>Atendimento: {proposal.seller} · {proposal.company.whatsapp}</Text>
          </View>
          <View style={s.ctaButtons}>
            <Link src={links.approve} style={s.btnApprove}><Text style={s.btnText}>Aprovar</Text></Link>
            <Link src={links.talk} style={s.btnTalk}><Text style={s.btnText}>Falar com atendente</Text></Link>
          </View>
        </View>
        {/* Rodapé no fluxo (o "fixed" absoluto do react-pdf não era desenhado). */}
        <View style={s.foot}>
          <Text>{proposal.company.name} · {proposal.company.document} · {proposal.company.address}</Text>
          <Text>{proposal.company.site}</Text>
        </View>
        </View>
      </Page>
    </Document>
  );
}

/** Foto do fornecedor → data URL (o PDF não depende do CDN no momento de abrir). Falha vira "sem foto". */
async function inlineImage(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\/(cdn\.xbzbrindes\.com\.br|www\.spotgifts\.com\.br|media\.asiaimport\.com\.br)\//.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !/image\/(jpeg|png)/.test(type)) return null;
    return `data:${type.split(";")[0]};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderProposalPdf(proposal: Proposal): Promise<Buffer> {
  registerFonts();
  const images = await Promise.all(proposal.items.map((item) => inlineImage(item.imageUrl)));
  const withImages = { ...proposal, items: proposal.items.map((item, index) => ({ ...item, imageUrl: images[index] })) };
  // Logo como data URL: caminho de arquivo no Windows ("C:\...") é lido como URL pelo react-pdf.
  const logo = `data:image/png;base64,${readFileSync(path.join(ASSETS, "proposal-logo.png")).toString("base64")}`;
  return renderToBuffer(<ProposalDocument logo={logo} proposal={withImages} />);
}
