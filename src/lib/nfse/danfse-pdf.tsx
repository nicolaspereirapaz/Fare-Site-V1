/**
 * Desenha o DANFSe v2.0 em A4 (NT 008/2026, Anexo I) com @react-pdf/renderer, a mesma lib do site.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { Danfse } from "./danfse";

const cm = (n: number) => n * 28.3465;
const CINZA = "#F2F2F2"; // 5% de densidade (item 2.2.3)
const LINHA = 0.5;

/**
 * Fontes do item 2.4 da NT: Arial nos títulos, Microsoft Sans Serif no conteúdo.
 * Windows já tem as duas; no Linux a Arial vem do pacote ttf-mscorefonts-installer (Microsoft Sans Serif não existe lá: usa Arial).
 * Sem nenhuma, cai na Helvetica embutida do PDF (mesmas medidas da Arial).
 */
const PASTAS = [process.env.WINDIR && path.join(process.env.WINDIR, "Fonts"), "/usr/share/fonts/truetype/msttcorefonts"].filter(Boolean) as string[];
const acha = (...nomes: string[]) => PASTAS.flatMap((d) => nomes.map((n) => path.join(d, n))).find((f) => existsSync(f));
const arial = acha("arial.ttf", "Arial.ttf");
const arialNegrito = acha("arialbd.ttf", "Arial_Bold.ttf");
const sansSerif = acha("micross.ttf");
if (arial && arialNegrito) Font.register({ family: "Arial", fonts: [{ src: arial }, { src: arialNegrito, fontWeight: 700 }] });
if (sansSerif) Font.register({ family: "Microsoft Sans Serif", src: sansSerif });
const TITULO = arial && arialNegrito ? "Arial" : "Helvetica";
const CONTEUDO = sansSerif ? "Microsoft Sans Serif" : TITULO;
const NEGRITO = { fontFamily: TITULO, fontWeight: 700 } as const;

const s = StyleSheet.create({
  page: { padding: cm(0.3), fontFamily: CONTEUDO, color: "#000" },
  folha: { flexGrow: 1, borderWidth: 1, borderColor: "#000" },
  bloco: { borderBottomWidth: LINHA, borderColor: "#000" },
  linha: { flexDirection: "row" },
  cel: { paddingHorizontal: 3, paddingVertical: 2, minHeight: cm(0.63) },
  rot: { ...NEGRITO, fontSize: 6 },
  rotId: { ...NEGRITO, fontSize: 7 },
  val: { fontSize: 7, marginTop: 1 },
  titBloco: { ...NEGRITO, fontSize: 7 },
  aviso: { ...NEGRITO, fontSize: 7, textAlign: "center", paddingVertical: 2 },
});

function Cel({ rotulo, valor, span = 1, cinza, id }: { rotulo: string; valor?: string; span?: number; cinza?: boolean; id?: boolean }) {
  return (
    <View style={[s.cel, { width: `${span * 25}%` }, cinza ? { backgroundColor: CINZA } : {}]}>
      <Text style={id ? s.rotId : s.rot}>{rotulo}</Text>
      {valor != null ? <Text style={s.val}>{valor}</Text> : null}
    </View>
  );
}

/** Célula do título do bloco: caixa alta, 7 pt, fundo cinza. */
const Titulo = ({ texto, span = 1 }: { texto: string; span?: number }) => (
  <View style={[s.cel, { width: `${span * 25}%`, backgroundColor: CINZA, justifyContent: "center" }]}>
    <Text style={s.titBloco}>{texto}</Text>
  </View>
);

const NaoIdentificado = ({ texto }: { texto: string }) => (
  <View style={s.bloco}><Text style={s.aviso}>{texto}</Text></View>
);

function Pessoa({ titulo, p, simples }: { titulo: string; p: NonNullable<Danfse["tomador"]>; simples?: { sn: string; regime: string } }) {
  return (
    <View style={s.bloco}>
      <View style={s.linha}>
        <Titulo texto={titulo} />
        <Cel rotulo="CNPJ / CPF / NIF" valor={p.doc} />
        <Cel rotulo="Indicador Municipal (Inscrição)" valor={p.im} />
        <Cel rotulo="Telefone" valor={p.fone} />
      </View>
      <View style={s.linha}>
        <Cel rotulo="Nome / Nome Empresarial" valor={p.nome} span={2} />
        <Cel rotulo="Município / Sigla UF" valor={p.municipio} />
        <Cel rotulo="Código IBGE / CEP" valor={p.ibgeCep} />
      </View>
      <View style={s.linha}>
        <Cel rotulo="Endereço" valor={p.endereco} span={2} />
        <Cel rotulo="E-mail" valor={p.email} span={2} />
      </View>
      {simples ? (
        <View style={s.linha}>
          <Cel rotulo="Simples Nacional na Data de Competência" valor={simples.sn} />
          <Cel rotulo="Regime de Apuração Tributária pelo SN" valor={simples.regime} span={3} />
        </View>
      ) : null}
    </View>
  );
}

function DanfseDoc({ d, qr, logo, cancelada }: { d: Danfse; qr: string; logo: string; cancelada?: boolean }) {
  const { cabecalho: h, id, prestador: pr, servico: sv, issqn, federal: fe, ibscbs: ib, total: t } = d;
  return (
    <Document title={`NFS-e ${id.nNFSe}`} author="Fare Foto">
      <Page size="A4" style={s.page}>
        <View style={s.folha}>
          {/* Cabeçalho */}
          <View style={[s.bloco, s.linha, { height: cm(1.16), backgroundColor: CINZA, alignItems: "center" }]}>
            <View style={{ width: "25%", paddingLeft: cm(0.19) }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={logo} style={{ width: cm(4), height: cm(0.81) }} />
            </View>
            <View style={{ width: "50%", alignItems: "center" }}>
              <Text style={{ ...NEGRITO, fontSize: 9 }}>DANFSe v2.0</Text>
              <Text style={{ ...NEGRITO, fontSize: 9 }}>Documento Auxiliar da NFS-e</Text>
              {h.teste ? <Text style={{ ...NEGRITO, fontSize: 9, color: "#FF0000" }}>NFS-e SEM VALIDADE JURÍDICA</Text> : null}
            </View>
            <View style={{ width: "25%", paddingLeft: 3 }}>
              {h.municipio ? <Text style={{ fontSize: 8 }}>{h.municipio}</Text> : null}
              <Text style={{ fontSize: 6 }}>Ambiente Gerador: {h.ambGer}</Text>
              <Text style={{ fontSize: 6 }}>Tipo de Ambiente: {h.tpAmb}</Text>
            </View>
          </View>

          {/* Identificação da NFS-e + QR Code */}
          <View style={[s.bloco, s.linha]}>
            <View style={{ width: "75%" }}>
              <View style={s.cel}>
                <Text style={s.rotId}>CHAVE DE ACESSO DA NFS-E</Text>
                <Text style={s.val}>{id.chave}</Text>
              </View>
              {[
                [["NÚMERO DA NFS-E", id.nNFSe], ["COMPETÊNCIA DA NFS-E", id.competencia], ["DATA E HORA DA EMISSÃO DA NFS-E", id.dhProc]],
                [["NÚMERO DA DPS", id.nDPS], ["SÉRIE DA DPS", id.serie], ["DATA E HORA DA EMISSÃO DA DPS", id.dhEmi]],
                [["EMITENTE DA NFS-E", id.emitente], ["SITUAÇÃO DA NFS-E", id.situacao], ["FINALIDADE", id.finalidade]],
              ].map((linha, i) => (
                <View key={i} style={s.linha}>
                  {linha.map(([r, v], j) => (
                    <View key={r} style={[s.cel, { width: "33.333%" }, i === 2 && j === 0 ? { backgroundColor: CINZA } : {}]}>
                      <Text style={s.rotId}>{r}</Text>
                      <Text style={s.val}>{v}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <View style={{ width: "25%", alignItems: "center", justifyContent: "center", padding: 4 }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={qr} style={{ width: cm(1.6), height: cm(1.6) }} />
              <Text style={{ fontSize: 6, textAlign: "center", marginTop: 4 }}>
                A autenticidade desta NFS-e pode ser verificada{"\n"}pela leitura deste código QR ou pela consulta da{"\n"}chave de acesso no portal nacional da NFS-e
              </Text>
            </View>
          </View>

          <Pessoa titulo="PRESTADOR / FORNECEDOR" p={pr} simples={{ sn: pr.simples, regime: pr.regime }} />
          {d.tomador ? <Pessoa titulo="TOMADOR / ADQUIRENTE" p={d.tomador} /> : <NaoIdentificado texto="TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" />}
          {/* shortcut: a DPS da Fare não usa os grupos destinatário (IBSCBS/dest) e intermediário; se um dia usar, desenhar os blocos aqui. */}
          <NaoIdentificado texto="DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" />
          <NaoIdentificado texto="INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" />

          {/* Serviço */}
          <View style={s.bloco}>
            <View style={s.linha}>
              <Titulo texto="SERVIÇO PRESTADO" />
              <Cel rotulo="Código de Tributação Nacional / Municipal" valor={sv.codigo} />
              <Cel rotulo="Código da NBS" valor={sv.nbs} />
              <Cel rotulo="Local da Prestação / Sigla UF / País" valor={sv.local} />
            </View>
            <View style={[s.cel, { minHeight: cm(0.38) }]}><Text style={s.val}>{sv.descCodigo}</Text></View>
            <Cel rotulo="Descrição do Serviço" valor={sv.descricao} span={4} />
          </View>

          {/* ISSQN */}
          <View style={s.bloco}>
            <View style={s.linha}>
              <Titulo texto="TRIBUTAÇÃO MUNICIPAL (ISSQN)" />
              <Cel rotulo="Tipo de Tributação do ISSQN" valor={issqn.tipo} />
              <Cel rotulo="Município / Sigla UF / País de Incidência do ISSQN" valor={issqn.incidencia} span={2} />
            </View>
            <View style={s.linha}>
              <Cel rotulo="BC ISSQN" valor={issqn.bc} />
              <Cel rotulo="Alíquota Aplicada" valor={issqn.aliquota} />
              <Cel rotulo="Retenção do ISSQN" valor={issqn.retencao} />
              <Cel rotulo="ISSQN Apurado" valor={issqn.apurado} />
            </View>
          </View>

          {/* Federal */}
          <View style={s.bloco}>
            <View style={s.linha}>
              <Titulo texto="TRIBUTAÇÃO FEDERAL (EXCETO CBS)" />
              <Cel rotulo="IRRF" valor={fe.irrf} />
              <Cel rotulo="Contribuição Previdenciária - Retida" valor={fe.cp} />
              <Cel rotulo="Contribuições Sociais - Retidas" valor={fe.contribRetidas} />
            </View>
            {fe.linhaPisCofins ? (
              <View style={s.linha}>
                <Cel rotulo="PIS - Débito Apuração Própria" valor={fe.pis} />
                <Cel rotulo="COFINS - Débito Apuração Própria" valor={fe.cofins} />
                <Cel rotulo="Descrição Contrib. Sociais - Retidas" valor={fe.descContrib} span={2} />
              </View>
            ) : null}
          </View>

          {/* IBS/CBS */}
          <View style={s.bloco}>
            <View style={s.linha}>
              <Titulo texto="TRIBUTAÇÃO IBS / CBS" />
              <Cel rotulo="CST / cClassTrib" valor={ib.cst} />
              <Cel rotulo="Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF" valor={ib.indOp} span={2} />
            </View>
            <View style={s.linha}>
              <Cel rotulo="Exclusões e Reduções da Base de Cálculo" valor={ib.exclusoes} />
              <Cel rotulo="Base de Cálculo Após Exclusões e Reduções" valor={ib.bc} />
              <Cel rotulo="Red. Alíquota IBS / Red. Alíquota CBS" valor={ib.redAliq} />
              <Cel rotulo="Alíquota - IBS UF / IBS Mun" valor={ib.aliqIbs} />
            </View>
            <View style={s.linha}>
              <Cel rotulo="Alíq. Efetiva Municipal - IBS" valor={ib.efetMun} />
              <Cel rotulo="Valor Apurado Municipal - IBS" valor={ib.vMun} />
              <Cel rotulo="Alíq. Efetiva Estadual - IBS" valor={ib.efetUF} />
              <Cel rotulo="Valor Apurado Estadual - IBS" valor={ib.vUF} />
            </View>
            <View style={s.linha}>
              <Cel rotulo="Valor Total Apurado - IBS" valor={ib.vIBSTot} />
              <Cel rotulo="Alíquota - CBS" valor={ib.pCBS} />
              <Cel rotulo="Alíquota Efetiva - CBS" valor={ib.efetCBS} />
              <Cel rotulo="Valor Total Apurado - CBS" valor={ib.vCBS} />
            </View>
          </View>

          {/* Totais */}
          <View style={s.bloco}>
            <View style={s.linha}>
              <Titulo texto="VALOR TOTAL DA NFS-E" />
              <Cel rotulo="Valor da Operação / Serviço" valor={t.vServ} />
              <Cel rotulo="Desconto Incondicionado" valor={t.descIncond} />
              <Cel rotulo="Desconto Condicionado" valor={t.descCond} />
            </View>
            <View style={s.linha}>
              <Cel rotulo="Total das Retenções (ISSQN / Federais)" valor={t.retencoes} />
              <Cel rotulo="Valor Líquido da NFS-e" valor={t.vLiq} />
              <Cel rotulo="Total do IBS/CBS" valor={t.ibsCbs} />
              <Cel rotulo="Valor Líquido da NFS-e + IBS/CBS" valor={t.liqMaisIbsCbs} cinza />
            </View>
          </View>

          {/* Informações complementares: ocupa o espaço que sobra até o canhoto */}
          <View style={[s.bloco, { flexGrow: 1 }]}>
            <View style={s.linha}><Titulo texto="INFORMAÇÕES COMPLEMENTARES" span={4} /></View>
            {d.complementares.map((c) => <Text key={c} style={[s.val, { paddingHorizontal: 3, marginTop: 3 }]}>{c}</Text>)}
          </View>

          {/* Canhoto (opcional, item 2.1.13) */}
          <View style={s.linha}>
            <Cel rotulo="Data Cientificação" />
            <Cel rotulo="Identificação e Assinatura" />
            <Cel rotulo="Nº NFS-e / Chave NFS-e" valor={d.canhoto} span={2} />
          </View>
        </View>
        {/* Item 2.5.1: marca d'água diagonal, 50 pt ou mais, cinza K35. */}
        {cancelada ? (
          <Text fixed style={{ position: "absolute", top: cm(13), left: cm(1.5), width: cm(18), textAlign: "center", ...NEGRITO, fontWeight: 400, fontSize: 90, color: "#A6A6A6", opacity: 0.6, transform: "rotate(-45deg)" }}>
            CANCELADA
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}

let pronto = false;
let logo: string | undefined;

export async function gerarPdf(d: Danfse, opcoes: { cancelada?: boolean } = {}): Promise<Buffer> {
  if (!pronto) {
    Font.registerHyphenationCallback((palavra) => [palavra]); // não quebra palavras com hífen
    pronto = true;
  }
  const qr = await QRCode.toDataURL(d.id.qrcode, { margin: 0, errorCorrectionLevel: "M", width: 300 });
  // Caminho de arquivo não carrega no Windows; embute como data URL.
  logo ??= `data:image/png;base64,${readFileSync(path.join(process.cwd(), "src", "assets", "logo-nfse.png")).toString("base64")}`;
  return renderToBuffer(<DanfseDoc cancelada={opcoes.cancelada} d={d} logo={logo} qr={qr} />);
}
