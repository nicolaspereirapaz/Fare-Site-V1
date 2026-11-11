import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateXML } from "xmllint-wasm";

/** Valida a DPS no XSD oficial do ambiente: produção (1) e produção restrita (2) têm leiautes diferentes. */
export async function validarXsd(xml: string, ambiente: 1 | 2, raiz = "DPS_v1.01.xsd") {
  const pasta = path.join(__dirname, "xsd", ambiente === 1 ? "producao" : "producao-restrita");
  // O XSD de produção traz pattern "^0{0,4}\d{1,5}$": em XSD ^ e $ são literais e nada casa. A Sefin (.NET) trata como âncora; aqui também.
  const xsds = readdirSync(pasta).map((fileName) => ({
    fileName,
    contents: readFileSync(path.join(pasta, fileName), "utf8").replace('value="^0{0,4}\\d{1,5}$"', 'value="0{0,4}\\d{1,5}"'),
  }));
  const r = await validateXML({
    xml: { fileName: "dps.xml", contents: xml },
    schema: xsds.find((x) => x.fileName === raiz)!,
    preload: xsds.filter((x) => x.fileName !== raiz),
  });
  return r.errors.map((e) => e.message);
}
