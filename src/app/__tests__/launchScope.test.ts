import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));

import ProductsPage from "@/app/(loja)/produtos/page";
import ProductPage from "@/app/(loja)/produtos/[slug]/page";

describe("lançamento só com brindes", () => {
  it("o catálogo de produtos próprios leva para os brindes", async () => {
    await expect(ProductsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/brindes");
  });

  it("a página de um produto próprio também leva para os brindes", async () => {
    redirect.mockClear();
    await expect(ProductPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/brindes");
  });
});
