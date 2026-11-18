import { describe, expect, it } from "vitest";
import { pngCommand } from "@/lib/printQueue";

describe("pngCommand", () => {
  it("usa o pdftoppm do Poppler com -png quando FARE_PDFTOPNG não está definido", () => {
    expect(pngCommand("a.pdf", "saida", {})).toEqual(["pdftoppm", ["-r", "300", "-png", "a.pdf", "saida"]]);
  });

  it("usa o pdftopng do Xpdf, sem -png, quando FARE_PDFTOPNG aponta para ele", () => {
    expect(pngCommand("a.pdf", "saida", { FARE_PDFTOPNG: " C:\\FareFoto\\xpdf\\pdftopng.exe " })).toEqual(["C:\\FareFoto\\xpdf\\pdftopng.exe", ["-r", "300", "a.pdf", "saida"]]);
  });
});
