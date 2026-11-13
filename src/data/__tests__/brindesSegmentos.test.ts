import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { copiesToFill } from "@/components/SegmentShowcase";
import { BRINDES_VITRINE, SEGMENTS } from "@/data/brindesSegmentos";

const inPublic = (src: string) => existsSync(path.join(process.cwd(), "public", src));

describe("páginas de brindes por segmento", () => {
  it("cada segmento tem endereço único, banner nos dois formatos e título com destaque", () => {
    expect(new Set(SEGMENTS.map((segment) => segment.slug)).size).toBe(SEGMENTS.length);
    for (const segment of SEGMENTS) {
      expect(inPublic(segment.banner.pc), segment.banner.pc).toBe(true);
      expect(inPublic(segment.banner.mobile), segment.banner.mobile).toBe(true);
      expect(segment.title, segment.slug).toMatch(/^[^*]+\*\*[^*]+\*\*$/);
    }
  });

  it("as fotos da vitrine existem", () => {
    for (const card of BRINDES_VITRINE) expect(inPublic(card.image), card.image).toBe(true);
  });

  it("repete a faixa até cada metade cobrir a tela", () => {
    expect(copiesToFill(1000, 2000)).toBe(2);
    expect(copiesToFill(3440, 1800)).toBe(4);
    expect(copiesToFill(390, 1300)).toBe(2);
  });
});
