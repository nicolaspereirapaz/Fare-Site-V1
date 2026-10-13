import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Link, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
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
  colQty: { width: 48, textAlign: "right" },
  colUnit: { width: 68, textAlign: "right" },
  colTotal: { width: 78, textAlign: "right" },
  thumb: { width: 44, height: 44, objectFit: "contain", borderWidth: 0.75, borderColor: C.line, borderRadius: 5, marginRight: 10 },
  /** Item sem foto: espaço vazio do tamanho da foto, para os nomes ficarem alinhados. */
  thumbSpace: { width: 44, marginRight: 10 },
  /** Empurra condições + WhatsApp para o pé da página. */
  spacer: { flexGrow: 1 },
  prodName: { fontSize: 10.5, fontWeight: 700, color: C.ink, textDecoration: "none" },
  prodLink: { fontSize: 10.5, fontWeight: 700, color: C.navy, textDecoration: "underline" },
  small: { fontSize: 8.5, color: C.muted, marginTop: 1.5 },
  engraving: { fontSize: 8.5, color: C.text, marginTop: 2 },
  unit: { fontWeight: 700, color: C.ink },
  totals: { marginTop: 12, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: C.navy },
  grandValue: { fontFamily: "Outfit", fontWeight: 700, fontSize: 17, color: C.ink },
  terms: { marginTop: 24, flexDirection: "row", flexWrap: "wrap" },
  term: { width: "50%", paddingRight: 16, marginBottom: 10 },
  termText: { color: C.text },
  hint: { marginTop: 4, fontSize: 8, color: C.muted },
  cta: { marginTop: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.ink, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16 },
  ctaTitle: { color: "#fff", fontSize: 11, fontWeight: 700 },
  ctaSub: { color: "#c9cde0", fontSize: 8.5, marginTop: 2 },
  ctaButtons: { flexDirection: "row", alignItems: "center" },
  /** Botões são links inteiros (react-pdf: estilo no Link + Text dentro). */
  btnApprove: { backgroundColor: C.orange, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16, textDecoration: "none" },
  btnTalk: { borderWidth: 1, borderColor: "#8d93b5", borderRadius: 6, paddingVertical: 7, paddingHorizontal: 14, marginLeft: 8, textDecoration: "none" },
  btnText: { color: "#fff", fontSize: 10, fontWeight: 700 },
  foot: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 6 },
});

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
            <Text style={s.colQty}>{item.quantity.toLocaleString("pt-BR")}</Text>
            <Text style={[s.colUnit, s.unit]}>{brl(item.unitPrice)}</Text>
            <Text style={s.colTotal}>{brl(item.total)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}><Text>Subtotal ({proposal.items.length} {proposal.items.length === 1 ? "item" : "itens"})</Text><Text>{brl(proposal.total)}</Text></View>
          <View style={s.totalRow}><Text>Frete</Text><Text>A combinar</Text></View>
          <View style={s.grand}><Text style={{ fontWeight: 700, color: C.ink }}>Total</Text><Text style={s.grandValue}>{brl(proposal.total)}</Text></View>
        </View>

        <View style={s.spacer} />
        <View wrap={false}>
        <View style={s.terms}>
          {proposal.terms.map((term) => (
            <View key={term.title} style={s.term}>
              <Text style={s.label}>{term.title}</Text>
              <Text style={s.termText}>{term.text}</Text>
            </View>
          ))}
        </View>
        {proposal.items.some((item) => item.url) ? <Text style={s.hint}>Clique no nome do produto para ver fotos e detalhes no site.</Text> : null}

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
