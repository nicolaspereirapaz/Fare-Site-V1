"""
Gera src/components/staff/staff-dark.css: o tema escuro da área da equipe, na paleta do Atendimento.

Lê as cores fixas dos CSS da equipe e escreve, para cada regra, a mesma regra prefixada com
[data-atd-theme="dark"] e as cores trocadas (fundo claro -> superfície escura, texto escuro -> claro,
borda clara -> borda escura; cores fortes como o laranja ficam). Variáveis (--qe-*, --rt-*) e
ajustes finos ficam na parte escrita à mão, no fim do arquivo (MANUAL abaixo).

Rodar de novo depois de mudar cores nesses CSS:  python scripts/gerar-tema-escuro-equipe.py
"""
import colorsys
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/components/staff/staff-dark.css"
# globals.css mistura loja e equipe: só entram regras com classes da equipe.
GLOBAL_CLASSES = re.compile(r"\.(staff-|kb-|backoffice-|quote-status-|account-order-status)")
FILES = [
    "src/components/staff/quoteEditor.css",
    "src/components/staff/customers.css",
    "src/components/staff/closeQuote.css",
    "src/components/staff/staffDocument.css",
    "src/components/staff/retirada.css",
    "src/components/staff/nfse.css",
    "src/components/staff/fotos/fotosEquipe.css",
    "src/components/staff/fotos/kanbanFotos.css",
]
HAND_TUNED = ROOT / "src/components/staff/atendimento/atendimento-dark.css"

BG, SURFACE, RAISED, RAISED_2 = "#0e1014", "#171a20", "#222730", "#2c323d"
INK, MUTED, FAINT, NAVY_TEXT = "#e3e5ea", "#a8afbd", "#7d8494", "#e8ebf7"
BORDER, BORDER_STRONG, BORDER_DARK, ACCENT = "#2a2f39", "#3a404c", "#4a5160", "#4453a8"

COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b")
BG_PROPS = {"background", "background-color"}
TEXT_PROPS = {"color", "caret-color", "fill", "stroke", "text-decoration-color", "accent-color"}
BORDER_PROPS = {"border", "border-color", "border-top", "border-bottom", "border-left", "border-right",
                "border-top-color", "border-bottom-color", "border-left-color", "border-right-color",
                "outline", "outline-color"}


def parse(color):
    c = color.lower()
    if c == "white":
        return 255, 255, 255, 1.0
    if c == "black":
        return 0, 0, 0, 1.0
    if c.startswith("#"):
        h = c[1:]
        if len(h) in (3, 4):
            h = "".join(ch * 2 for ch in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        return r, g, b, int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
    parts = [p.strip() for p in c[c.index("(") + 1:-1].replace("/", ",").split(",") if p.strip()]
    r, g, b = (int(float(p)) for p in parts[:3])
    return r, g, b, float(parts[3]) if len(parts) > 3 else 1.0


def hls(r, g, b):
    return colorsys.rgb_to_hls(r / 255, g / 255, b / 255)


def hexa(h, l, s):
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


def rgba(r, g, b, a):
    return f"rgba({r}, {g}, {b}, {round(a, 3)})"


def neutral(r, g, b):
    # Cinza: pouca saturação; nos tons quase brancos a saturação engana, então vale a diferença entre canais.
    return hls(r, g, b)[2] < 0.15 or max(r, g, b) - min(r, g, b) < 11


def navy(h, s):
    return 0.58 <= h <= 0.7 and s > 0.15


def as_bg(color):
    r, g, b, a = parse(color)
    h, l, s = hls(r, g, b)
    if a < 1:
        if l < 0.35 and a <= 0.2:  # véu escuro de hover num fundo claro -> véu claro
            return rgba(255, 255, 255, min(a * 0.8 + 0.02, 0.14))
        return color
    if neutral(r, g, b):
        return SURFACE if l >= 0.985 else RAISED if l >= 0.9 else RAISED_2 if l >= 0.75 else color
    if l >= 0.75:  # fundo pastel (selo verde, aviso laranja): mesmo tom, escuro
        return hexa(h, 0.17, min(s, 0.45))
    if l < 0.35 and navy(h, s):
        return ACCENT
    return color


def as_text(color):
    r, g, b, a = parse(color)
    h, l, s = hls(r, g, b)
    if l >= 0.85:
        return color
    if neutral(r, g, b):
        return INK if l < 0.3 else MUTED if l < 0.6 else FAINT
    if l < 0.35 and navy(h, s):
        return NAVY_TEXT
    if l < 0.5:
        return hexa(h, 0.72, min(s, 0.75)) if a == 1 else rgba(*(round(v * 255) for v in colorsys.hls_to_rgb(h, 0.72, min(s, 0.75))), a)
    return color


def as_border(color):
    r, g, b, a = parse(color)
    h, l, s = hls(r, g, b)
    if a < 1:
        if l < 0.35:
            return BORDER if a >= 0.1 else rgba(255, 255, 255, 0.06)
        return color
    if neutral(r, g, b):
        return BORDER if l >= 0.85 else BORDER_STRONG if l >= 0.7 else BORDER_DARK
    if l >= 0.75:
        return hexa(h, 0.32, min(s, 0.5))
    if l < 0.4:
        return hexa(h, 0.6, min(s, 0.6))
    return color


def split_top(value, sep=","):
    out, depth, cur = [], 0, ""
    for ch in value:
        depth += ch == "("
        depth -= ch == ")"
        if ch == sep and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


def as_shadow(value):
    layers = []
    for layer in split_top(value):
        colors = list(COLOR.finditer(layer))
        if not colors:
            layers.append(layer)
            continue
        lengths = [t for t in COLOR.sub("", layer).replace("inset", "").split() if t]
        ring = "inset" in layer or (len(lengths) >= 4 and lengths[2] in ("0", "0px"))
        color = colors[0].group(0)
        r, g, b, a = parse(color)
        h, l, s = hls(r, g, b)
        spread = lengths[3] if len(lengths) >= 4 else "0"
        focus = spread not in ("0", "0px", "1px", ".5px", "0.5px")
        if ring:
            # Anel largo e translúcido = foco (azul claro); anel fino = borda do cartão.
            new = rgba(141, 155, 240, 0.3) if focus and a < 1 and l < 0.35 and a <= 0.2 else as_border(color)
        elif a < 1 and l < 0.35:  # sombra de queda: preta e mais forte, senão some no escuro
            new = rgba(0, 0, 0, min(0.6, a * 3 + 0.15))
        else:
            new = color
        layers.append(layer[:colors[0].start()] + new + layer[colors[0].end():])
    return ",".join(layers)


def convert(prop, value):
    if prop == "box-shadow":
        return as_shadow(value)
    fn = as_bg if prop in BG_PROPS else as_text if prop in TEXT_PROPS else as_border if prop in BORDER_PROPS else None
    if not fn or "url(" in value and prop != "background":
        return value
    return COLOR.sub(lambda m: fn(m.group(0)), value)


def strip_comments(text):
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def rules(text):
    """(pilha de @media, seletor, corpo) de cada regra."""
    out, i, stack, buf = [], 0, [], ""
    while i < len(text):
        ch = text[i]
        if ch == "{":
            head, buf = buf.strip(), ""
            if head.startswith(("@media", "@supports", "@container")):
                stack.append(head)
            elif head.startswith("@"):
                depth, j = 1, i + 1
                while depth and j < len(text):
                    depth += text[j] == "{"
                    depth -= text[j] == "}"
                    j += 1
                i = j
                continue
            else:
                j = text.index("}", i)
                out.append((tuple(stack), head, text[i + 1:j]))
                i = j + 1
                continue
        elif ch == "}":
            if stack:
                stack.pop()
            buf = ""
        else:
            buf += ch
        i += 1
    return out


def prefix(selector):
    sel = " ".join(selector.split())
    if sel.startswith((":root", "html")):
        return None
    if sel.startswith(".staff-body"):
        return '.staff-body[data-atd-theme="dark"]' + sel[len(".staff-body"):]
    if sel.startswith("body"):
        return 'body[data-atd-theme="dark"]' + sel[4:]
    return '[data-atd-theme="dark"] ' + sel


def main():
    tuned = {" ".join(s.split()) for _, sel, _ in rules(strip_comments(HAND_TUNED.read_text(encoding="utf-8")))
             for s in split_top(sel)}
    sources = [("src/app/globals.css (classes da equipe)", (ROOT / "src/app/globals.css").read_text(encoding="utf-8"))]
    sources += [(f, (ROOT / f).read_text(encoding="utf-8")) for f in FILES]
    lines = ["/* GERADO por scripts/gerar-tema-escuro-equipe.py a partir dos CSS da equipe. Não edite à mão acima de MANUAL. */"]
    for name, text in sources:
        lines.append(f"\n/* --- {name} --- */")
        for media, sel, body in rules(strip_comments(text)):
            if name.startswith("src/app/globals.css") and not GLOBAL_CLASSES.search(sel):
                continue
            changed = []
            for part in body.split(";"):
                if ":" not in part:
                    continue
                prop, value = (x.strip() for x in part.split(":", 1))
                if prop.startswith("--") or not COLOR.search(value):
                    continue
                new = convert(prop.lower(), value)
                if new != value:
                    changed.append(f"{prop}: {new}")
            if not changed:
                continue
            sels = [p for s in split_top(sel) if (p := prefix(s)) and p not in tuned]
            if not sels:
                continue
            rule = f"{', '.join(sels)} {{ {'; '.join(changed)}; }}"
            for m in reversed(media):
                rule = f"{m} {{ {rule} }}"
            lines.append(rule)
    manual = OUT.read_text(encoding="utf-8").split("/* ===== MANUAL", 1) if OUT.exists() else [""]
    tail = "/* ===== MANUAL" + manual[1] if len(manual) > 1 else "/* ===== MANUAL: ajustes escritos à mão (o gerador mantém esta parte) ===== */\n"
    OUT.write_text("\n".join(lines) + "\n\n" + tail, encoding="utf-8", newline="\n")
    print(f"{OUT.relative_to(ROOT)}: {len(lines) - 1} linhas geradas")


if __name__ == "__main__":
    main()
