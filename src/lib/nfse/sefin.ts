import { readFileSync } from "node:fs";
import https from "node:https";
import { gunzipSync, gzipSync } from "node:zlib";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";

const URLS = {
  1: { sefin: "https://sefin.nfse.gov.br/SefinNacional" },
  2: { sefin: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional" },
} as const;

export function ambiente(): 1 | 2 {
  return process.env.NFSE_AMBIENTE === "1" ? 1 : 2;
}

type Certificado = { key: string; cert: string };
let cache: Certificado | null = null;

/**
 * Lê o .pfx com node-forge e devolve chave + certificado em PEM.
 * PEM em vez de `pfx` no TLS: muito .pfx ICP-Brasil usa criptografia antiga que o OpenSSL 3 do Node recusa.
 */
export function certificado(): Certificado {
  if (cache) return cache;
  const caminho = process.env.NFSE_PFX_PATH;
  const senha = process.env.NFSE_PFX_SENHA;
  if (!caminho || senha == null || senha === "") throw new Error("Configure NFSE_PFX_PATH e NFSE_PFX_SENHA no arquivo .env.local.");
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(readFileSync(caminho).toString("binary")), senha);
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  const privada = keyBag?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!privada) throw new Error("Não achei a chave privada dentro do certificado.");
  // O .pfx traz também os certificados da cadeia; o nosso é o que casa com a chave privada.
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const meu = certs.map((b) => b.cert!).find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(privada.n));
  if (!meu) throw new Error("Não achei o certificado da empresa dentro do .pfx.");
  if (meu.validity.notAfter < new Date()) throw new Error(`Certificado vencido em ${meu.validity.notAfter.toLocaleDateString("pt-BR")}.`);
  cache = { key: forge.pki.privateKeyToPem(privada), cert: forge.pki.certificateToPem(meu) };
  return cache;
}

/** Assinatura XMLDSig envelopada no grupo informado (infDPS ou infPedReg), sem prefixo de namespace (regra E1228). */
export function assinar(xml: string, grupo: "infDPS" | "infPedReg" = "infDPS") {
  const { key, cert } = certificado();
  const sig = new SignedXml({
    privateKey: key,
    publicCert: cert,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${grupo}']`,
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${grupo}']`, action: "after" } });
  return sig.getSignedXml();
}

type Resposta = { status: number; tipo: string; corpo: Buffer };

/** HTTPS com certificado do cliente (mTLS), exigido em todas as APIs do Sistema Nacional. */
function chamar(metodo: string, url: string, json?: unknown): Promise<Resposta> {
  const { key, cert } = certificado();
  const corpo = json === undefined ? undefined : Buffer.from(JSON.stringify(json));
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: metodo,
        key,
        cert,
        timeout: 60_000,
        headers: { Accept: "application/json", ...(corpo ? { "Content-Type": "application/json", "Content-Length": corpo.length } : {}) },
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (p: Buffer) => partes.push(p));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, tipo: String(res.headers["content-type"] ?? ""), corpo: Buffer.concat(partes) }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado falando com a Sefin Nacional.")));
    req.on("error", reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

/** A API devolve campos ora em camelCase, ora em PascalCase; procura sem ligar para maiúsculas. */
function campo(obj: unknown, nome: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const k = Object.keys(obj).find((x) => x.toLowerCase() === nome.toLowerCase());
  return k ? (obj as Record<string, unknown>)[k] : undefined;
}

function mensagens(json: unknown, bruto: string): string[] {
  const lista = (campo(json, "erros") ?? campo(json, "erro") ?? campo(json, "alertas")) as unknown;
  const itens = Array.isArray(lista) ? lista : lista ? [lista] : [];
  const msgs = itens.map((e) => [campo(e, "codigo"), campo(e, "descricao"), campo(e, "complemento")].filter(Boolean).join(" - "));
  return msgs.length ? msgs : [bruto.slice(0, 500) || "Resposta vazia da Sefin Nacional."];
}

export type ResultadoEmissao =
  | { ok: true; chave: string; nNFSe?: string; xmlNfse: string }
  | { ok: false; erros: string[]; status: number };

export async function enviarDps(xmlAssinado: string): Promise<ResultadoEmissao> {
  const dpsXmlGZipB64 = gzipSync(Buffer.from(xmlAssinado, "utf8")).toString("base64");
  const r = await chamar("POST", `${URLS[ambiente()].sefin}/nfse`, { dpsXmlGZipB64 });
  const texto = r.corpo.toString("utf8");
  let json: unknown;
  try { json = JSON.parse(texto); } catch { json = undefined; }
  const chave = campo(json, "chaveAcesso");
  const nfse = campo(json, "nfseXmlGZipB64");
  if (r.status >= 200 && r.status < 300 && typeof chave === "string" && typeof nfse === "string") {
    const xmlNfse = gunzipSync(Buffer.from(nfse, "base64")).toString("utf8");
    return { ok: true, chave, nNFSe: xmlNfse.match(/<nNFSe>(\d+)<\/nNFSe>/)?.[1], xmlNfse };
  }
  return { ok: false, erros: mensagens(json, texto), status: r.status };
}

/** Depois de erro de rede: descobre se a DPS virou nota. Chave, null se com certeza não virou, erro se não deu para saber. */
export async function consultarDps(id: string): Promise<string | null> {
  const r = await chamar("GET", `${URLS[ambiente()].sefin}/dps/${id}`);
  if (r.status === 404) return null;
  const chave = r.status === 200 ? campo(JSON.parse(r.corpo.toString("utf8")), "chaveAcesso") : undefined;
  if (typeof chave !== "string") throw new Error(`Consulta da DPS respondeu HTTP ${r.status}.`);
  return chave;
}

export type ResultadoEvento = { ok: true; xmlEvento: string } | { ok: false; erros: string[]; status: number };

/** Registra um evento (ex.: cancelamento) na NFS-e. */
export async function enviarEvento(chave: string, xmlAssinado: string): Promise<ResultadoEvento> {
  const pedidoRegistroEventoXmlGZipB64 = gzipSync(Buffer.from(xmlAssinado, "utf8")).toString("base64");
  const r = await chamar("POST", `${URLS[ambiente()].sefin}/nfse/${chave}/eventos`, { pedidoRegistroEventoXmlGZipB64 });
  const texto = r.corpo.toString("utf8");
  let json: unknown;
  try { json = JSON.parse(texto); } catch { json = undefined; }
  const evento = campo(json, "eventoXmlGZipB64");
  if (r.status >= 200 && r.status < 300 && typeof evento === "string") {
    return { ok: true, xmlEvento: gunzipSync(Buffer.from(evento, "base64")).toString("utf8") };
  }
  return { ok: false, erros: mensagens(json, texto), status: r.status };
}
