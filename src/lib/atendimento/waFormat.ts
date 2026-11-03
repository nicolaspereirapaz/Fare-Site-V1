/**
 * Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~, ```monoespaçado``` e links.
 * Pode aninhar (ex.: "*_Michelle:_*" = negrito + itálico), como no app.
 * O marcador só vale nas bordas de palavra: "nome_do_arquivo" e "2*3*4" ficam como estão.
 */
export type WaNode =
  | { type: "text"; text: string }
  | { type: "link"; href: string }
  | { type: "bold" | "italic" | "strike" | "mono"; children: WaNode[] };

const PATTERN = /(https?:\/\/[^\s]+)|```([^`]+?)```|(?<![\p{L}\p{N}])([*_~])(?=\S)(.*?\S)\3(?![\p{L}\p{N}])/gu;
const KIND = { "*": "bold", _: "italic", "~": "strike" } as const;

export function parseWhatsApp(line: string): WaNode[] {
  const nodes: WaNode[] = [];
  let last = 0;
  for (const match of line.matchAll(PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: "text", text: line.slice(last, index) });
    if (match[1]) nodes.push({ type: "link", href: match[1] });
    else if (match[2] !== undefined) nodes.push({ type: "mono", children: [{ type: "text", text: match[2] }] });
    else nodes.push({ type: KIND[match[3] as keyof typeof KIND], children: parseWhatsApp(match[4]) });
    last = index + match[0].length;
  }
  if (last < line.length) nodes.push({ type: "text", text: line.slice(last) });
  return nodes;
}

const plain = (nodes: WaNode[]): string =>
  nodes.map((node) => (node.type === "text" ? node.text : node.type === "link" ? node.href : plain(node.children))).join("");

/** Texto sem os marcadores (prévias da lista, do quadro e das citações). */
export function stripWhatsApp(text: string) {
  return text.split("\n").map((line) => plain(parseWhatsApp(line))).join("\n");
}
