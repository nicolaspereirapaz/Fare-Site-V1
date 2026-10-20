import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "@/components/Analytics";
import { analyticsIds } from "@/lib/analytics";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/script", () => ({ default: (props: { id?: string; src?: string }) => <i data-testid="script" data-id={props.id ?? props.src} /> }));

describe("Google Analytics e Meta Pixel", () => {
  beforeEach(() => localStorage.clear());

  it("só aceita ids no formato certo", () => {
    expect(analyticsIds({ FARE_GA_ID: "G-ABC123", FARE_META_PIXEL_ID: "1234567890" })).toEqual({ gaId: "G-ABC123", pixelId: "1234567890" });
    expect(analyticsIds({ FARE_GA_ID: "G-1');alert(1)//", FARE_META_PIXEL_ID: "abc" })).toEqual({ gaId: null, pixelId: null });
  });

  it("sem ids não mostra nada", () => {
    const { container } = render(<Analytics gaId={null} pixelId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não carrega nada antes do aceite; carrega os dois depois de aceitar e lembra a escolha", async () => {
    render(<Analytics gaId="G-ABC123" pixelId="1234567890" />);
    expect(await screen.findByRole("region", { name: "Aviso de cookies" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("script")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(screen.getAllByTestId("script").map((s) => s.dataset.id)).toEqual(["https://www.googletagmanager.com/gtag/js?id=G-ABC123", "ga4", "meta-pixel"]);
    expect(localStorage.getItem("fare-cookies")).toBe("aceito");
  });

  it("recusar não carrega nada", async () => {
    render(<Analytics gaId="G-ABC123" pixelId="1234567890" />);
    fireEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    expect(screen.queryAllByTestId("script")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Aviso de cookies" })).not.toBeInTheDocument();
  });
});
