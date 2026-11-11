// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { describe, expect, it } from "vitest";
import { montarDps } from "../dps";
import { assinar } from "../sefin";
import { validarXsd } from "./xsd";

/** .pfx de mentira (autoassinado) só para provar que a assinatura fica válida e dentro do XSD. */
function pfxFalso(senha: string) {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ name: "commonName", value: "TESTE:50344377000136" }]);
  cert.setIssuer([{ name: "commonName", value: "TESTE:50344377000136" }]);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, { algorithm: "3des" });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), "nfse-")), "teste.pfx");
  writeFileSync(arquivo, Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"));
  return { arquivo, certPem: forge.pki.certificateToPem(cert) };
}

describe("assinar", () => {
  it("assina o infDPS, sem prefixo, válido e dentro do XSD", async () => {
    const { arquivo, certPem } = pfxFalso("1234");
    process.env.NFSE_PFX_PATH = arquivo;
    process.env.NFSE_PFX_SENHA = "1234";

    const { xml } = montarDps({ ambiente: 2, serie: "1", numero: 1, emissao: new Date(), servico: "impressao", descricao: "Teste", valorCentavos: 100 });
    const assinado = assinar(xml);

    expect(assinado).toMatch(/<\/infDPS><Signature xmlns="http:\/\/www.w3.org\/2000\/09\/xmldsig#">/);
    expect(assinado).not.toMatch(/<ds:/);
    expect(assinado).toContain("<X509Certificate>");

    const verificador = new SignedXml({ publicCert: certPem, getCertFromKeyInfo: () => null });
    verificador.loadSignature(assinado.match(/<Signature[\s\S]*<\/Signature>/)![0]);
    expect(verificador.checkSignature(assinado)).toBe(true);

    expect(await validarXsd(assinado, 2)).toEqual([]);
  }, 30_000);
});
