import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { brl, proposalReplyLinks, type Proposal } from "./proposal";
import type { OrderDocument } from "./orderDocument";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { mockupFileOf } from "@/lib/backoffice/mockupFiles";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const imageHosts = new Set(["cdn.xbzbrindes.com.br", "www.spotgifts.com.br", "media.asiaimport.com.br"]);
/** Raster only, no redirects/private hosts; bounded fetch. The resulting file needs no network. */
export async function embedDocumentImage(source: string | null): Promise<string | null> {
  if (!source) return null;
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(source)) return source.length <= MAX_IMAGE_BYTES ? source : null;
  try {
    // Mockup da equipe: arquivo local (JPG).
    const mockup = mockupFileOf(source);
    if (mockup) return statSync(mockup).size > MAX_IMAGE_BYTES ? null : `data:image/jpeg;base64,${readFileSync(mockup).toString("base64")}`;
    if (/^\/images\/[a-zA-Z0-9_/-]+\.(png|jpe?g|webp|gif)$/.test(source)) {
      const file = path.join(process.cwd(), "public", source);
      if (statSync(file).size > MAX_IMAGE_BYTES) return null;
      const extension = path.extname(file).slice(1).replace("jpg", "jpeg");
      return `data:image/${extension};base64,${readFileSync(file).toString("base64")}`;
    }
    const url = new URL(source);
    if (url.protocol !== "https:" || !imageHosts.has(url.hostname) || url.port || url.username || url.password) return null;
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(6000) });
    const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!response.ok || !type || !/^image\/(png|jpeg|webp|gif)$/.test(type) || !response.body) return null;
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const {value,done} = await reader.read(); if(done) break; size += value.length; if(size > MAX_IMAGE_BYTES) { await reader.cancel(); return null; } chunks.push(value); }
    return `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
  } catch { return null; }
}

const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;color:#111;background:#fff;-webkit-font-smoothing:antialiased;overflow-wrap:anywhere}
.page{max-width:860px;margin:0 auto;padding:44px 52px 72px}
header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding-bottom:20px;border-bottom:3px solid #F65C2D;margin-bottom:28px}
.logo{height:52px;width:auto;max-width:42%;object-fit:contain}.heading{text-align:right}
.heading .eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#999;font-weight:400}
h1{font-size:22px;font-weight:700;color:#2B3854;line-height:1.3}
.heading .muted{font-size:14px;color:#999;margin-top:3px;line-height:1.6}
h2{font-size:20px;font-weight:700;color:#2B3854;margin:4px 0 6px;line-height:1.3}
h3{font-size:15px;font-weight:700;color:#2B3854;margin:0 0 3px}
.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#F65C2D;font-weight:700}
.muted{font-size:14px;color:#999;line-height:1.7}
.customer{padding:12px 16px;border-radius:10px;background:#f8f8f8;margin-bottom:22px;display:inline-block;max-width:100%}
.customer .eyebrow{font-size:12px;margin-bottom:4px}.customer p{font-size:14px;color:#666;line-height:1.7;margin:0}
.conditions{display:flex;gap:10px;margin-bottom:36px;flex-wrap:wrap}
.conditions>div{border:1.5px solid #eee;border-radius:10px;padding:10px 14px;flex:1;min-width:100px}
.conditions .eyebrow{font-size:12px;letter-spacing:1px;color:#999;font-weight:600;margin-bottom:3px}
.conditions p{font-size:15px;font-weight:700;color:#2B3854;line-height:1.5}
.item{display:grid;grid-template-columns:minmax(0,400px) minmax(0,1fr);gap:40px;align-items:start;margin-bottom:36px}
.photo{display:block;border:0;border-radius:20px;overflow:hidden;background:#f5f5f5;padding:0;width:100%;color:inherit;font:inherit;cursor:zoom-in}
.photo img{display:block;width:100%;height:420px;object-fit:contain;transition:opacity .2s}.photo:hover img{opacity:.88}
.photo small{display:block;padding:7px 10px;font-size:13px;color:#888;background:#f8f8f8}
.no-photo{height:420px;display:grid;place-items:center;border-radius:20px;background:#f5f5f5;color:#999;font-size:14px}
.tags{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0 22px}
.tag{background:#f0f4ff;border:1px solid #d0d9f5;color:#2B3854;font-size:12px;font-weight:500;padding:4px 11px;border-radius:20px}
.engravings{padding-left:16px;font-size:14px;color:#777;line-height:1.9}
.description{margin:0;font-size:14px;line-height:1.65;color:#666;white-space:pre-line}
.prices{display:flex;gap:9px;margin-top:22px;flex-wrap:wrap}
.price{flex:1;min-width:110px;border-radius:12px;padding:14px 16px;background:#f8f8f8}
.price .eyebrow,.price.total>span{display:block;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#F65C2D;font-weight:700;margin-bottom:5px}
.price strong{display:block;font-size:22px;font-weight:700;color:#2B3854;line-height:1.2;white-space:nowrap}.price.total{background:#2B3854}.price.total strong{color:#fff}
.summary{border-top:2px solid #f0f0f0;margin-top:28px;padding-top:18px}
.summary>.eyebrow{letter-spacing:2px;margin-bottom:14px}
.row{display:flex;justify-content:space-between;gap:16px;font-size:14px;padding:9px 0;border-bottom:1px solid #f5f5f5}
.row>span{color:#888}.row>strong{font-weight:600;color:#2B3854;text-align:right}
.grand{align-items:center;background:#2B3854;border-radius:14px;padding:20px 28px;margin-top:12px;border:0}
.grand>span{font-size:14px;font-weight:600;color:rgba(255,255,255,.65)}.grand>strong{font-size:32px;font-weight:700;color:#fff;line-height:1.2}
.finance{font-size:15px}
.notice{margin-top:20px;background:#f8f8f8;border-radius:12px;padding:16px 20px}
.notice h3{font-size:14px;line-height:1.9;color:#777;font-weight:500}.notice .row{font-size:14px}
.cta{margin-top:24px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cta a{background:#2B3854;color:white;text-decoration:none;border-radius:10px;padding:12px 16px;font-size:14px;font-weight:600;min-height:44px;display:inline-flex;align-items:center}.cta a:first-child{background:#F65C2D}
.cta+.muted{margin-top:10px}
footer{margin-top:36px;padding-top:20px;border-top:1px solid #eee;font-size:13px;color:#999;line-height:1.7}footer strong{font-size:14px;font-weight:700;color:#2B3854}
button:focus-visible,a:focus-visible{outline:3px solid #F65C2D;outline-offset:4px}
dialog{border:0;padding:54px 16px 16px;background:#111;color:#fff;border-radius:14px;max-width:96vw;max-height:96dvh}
dialog::backdrop{background:rgb(0 0 0 / .92)}dialog img{display:block;max-width:88vw;max-height:78dvh;object-fit:contain}
dialog button{position:absolute;right:12px;top:10px;border:1px solid #aaa;background:#222;color:white;border-radius:8px;padding:8px 14px;min-height:44px;font:inherit;cursor:pointer}
@media(max-width:720px){.page{padding:28px 18px 52px}header{gap:12px}.logo{height:auto;width:130px}h1{font-size:20px}.item{grid-template-columns:minmax(0,1fr);gap:24px}.photo img,.no-photo{height:300px}.prices{flex-direction:column}.price{min-width:0}.grand{padding:20px 18px}.grand>strong{font-size:28px}.conditions>div{min-width:140px}}
@media print{.photo small,.cta{display:none}.item{break-inside:avoid}.page{padding:12px}}
`;
// The exact Inter weights embedded in the approved reference, kept local/offline.
const fontCss = [400, 500, 600, 700].map(weight => {
  const data = readFileSync(path.join(process.cwd(), `src/assets/document-inter-${weight}.woff2`)).toString("base64");
  return `@font-face{font-family:'Inter';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${data}) format('woff2');font-display:swap}`;
}).join("");
const zoomScript = `const modal=document.getElementById('zoom'), enlarged=document.getElementById('zoom-image');let trigger=null;document.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>{trigger=button;const image=button.querySelector('img');enlarged.src=image.src;enlarged.alt=image.alt;modal.showModal();}));document.getElementById('zoom-close').addEventListener('click',()=>modal.close());modal.addEventListener('click',event=>{if(event.target===modal)modal.close();});modal.addEventListener('close',()=>{enlarged.removeAttribute('src');trigger?.focus();});`;

async function renderDocumentHtml(doc: Proposal | OrderDocument): Promise<string> {
  const order = "kind" in doc ? doc : null;
  const quote = "validUntil" in doc ? doc : null;
  const images = await Promise.all(doc.items.map(item => embedDocumentImage(item.imageUrl)));
  let logo = "";
  try { logo = `data:image/png;base64,${readFileSync(path.join(process.cwd(), "src/assets/proposal-logo.png")).toString("base64")}`; } catch { /* Company name remains visible. */ }
  const links = quote ? proposalReplyLinks(quote) : {talk: buildWhatsAppUrl(`55${doc.company.whatsapp.replace(/\D/g, "")}`, `Olá! Quero falar sobre o pedido ${doc.code}.`)};
  const row = (label: string, value: string, extra = "") => `<div class="row ${extra}"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${order ? "Pedido" : "Orçamento"} ${escape(doc.code)} — ${escape(doc.company.name)}</title><style>${fontCss}${css}</style></head><body><main class="page"><header>${logo ? `<img class="logo" src="${logo}" alt="${escape(doc.company.name)}">` : `<strong>${escape(doc.company.name)}</strong>`}<div class="heading"><div class="eyebrow">${order ? "Pedido" : "Orçamento comercial"}</div><h1>${escape(doc.code)}</h1><div class="muted">Emissão: ${escape(doc.issuedAt)}${quote ? `<br>Válido até ${escape(quote.validUntil)}` : ""}</div></div></header><section class="customer" aria-label="Cliente"><div class="eyebrow">Cliente</div>${doc.customer.name ? `<h3>${escape(doc.customer.name)}</h3>` : ""}${[doc.customer.company,doc.customer.document,doc.customer.phone,doc.customer.city].filter(Boolean).map(value=>`<p>${escape(value)}</p>`).join("")}<p class="muted">Atendimento: ${escape(doc.seller)}</p></section><section class="conditions" aria-label="Condições comerciais">${doc.terms.map(term=>`<div><div class="eyebrow">${escape(term.title)}</div><p>${escape(term.text)}</p></div>`).join("")}</section>${doc.items.map((item,i)=>`<article class="item"><div>${images[i] ? `<button type="button" class="photo" data-zoom aria-label="Ampliar foto de ${escape(item.name)}"><img src="${images[i]}" alt="${escape(item.name)}"><small>Toque ou clique para ampliar</small></button>` : `<div class="no-photo">Foto indisponível</div>`}</div><div><div class="eyebrow">Item ${i+1}</div><h2>${escape(item.name)}</h2><div class="tags">${[item.code,item.color,`${item.quantity.toLocaleString("pt-BR")} ${item.quantity === 1 ? item.unitLabel?.one ?? "unidade" : item.unitLabel?.many ?? "unidades"}`].filter(Boolean).map(value=>`<span class="tag">${escape(value)}</span>`).join("")}</div>${item.description ? `<p class="description">${escape(item.description)}</p>` : ""}${item.specs?.length ? `<h3 style="margin-top:20px">Medidas</h3><ul class="engravings">${item.specs.map(value=>`<li>${escape(value)}</li>`).join("")}</ul>` : ""}${item.engravings.length ? `<h3 style="margin-top:20px">Personalização</h3><ul class="engravings">${item.engravings.map(value=>`<li>${escape(value)}</li>`).join("")}</ul>` : ""}<div class="prices"><div class="price"><span class="eyebrow">Unitário</span><strong>${escape(brl(item.unitPrice))}</strong></div><div class="price total"><span>Total do item</span><strong>${escape(brl(item.total))}</strong></div></div></div></article>`).join("")}<section class="summary" aria-label="Resumo financeiro"><div class="eyebrow">Resumo</div>${row("Subtotal",brl(doc.subtotal))}${doc.discount ? row(doc.discount.label,`− ${brl(doc.discount.amount)}`) : ""}${quote ? row("Frete","A combinar") : ""}${row("Total",brl(doc.total),"grand")}${order?.finance ? row("Recebido",brl(order.finance.paid),"finance")+row("Saldo",brl(order.finance.balance),"finance") : ""}</section>${quote ? `<section class="notice"><h3>${escape(quote.notice)}</h3>${quote.minimumDeposit !== undefined ? row("Sinal mínimo (50%)",brl(quote.minimumDeposit)) : ""}${quote.pixKey ? row("Chave Pix (CNPJ)",quote.pixKey) : ""}</section>` : ""}<nav class="cta" aria-label="Atendimento">${"approve" in links ? `<a href="${escape(links.approve)}" target="_blank" rel="noopener noreferrer">Aprovar proposta pelo WhatsApp</a>` : ""}<a href="${escape(links.talk)}" target="_blank" rel="noopener noreferrer">Falar com a Fare Foto</a></nav><p class="muted">Os botões de atendimento precisam de internet. As fotos e os detalhes deste documento estão disponíveis offline.</p><footer><strong>${escape(doc.company.name)}</strong><br>${escape(doc.company.document)}<br>${escape(doc.company.address)}<br>${escape(doc.company.whatsapp)} · ${escape(doc.company.site)}</footer></main><dialog id="zoom" aria-label="Foto ampliada"><button type="button" id="zoom-close" autofocus>Fechar foto ×</button><img id="zoom-image" alt=""></dialog><script>${zoomScript}</script></body></html>`;
}
export const renderProposalHtml = (proposal: Proposal) => renderDocumentHtml(proposal);
export const renderOrderHtml = (document: OrderDocument) => renderDocumentHtml(document);
