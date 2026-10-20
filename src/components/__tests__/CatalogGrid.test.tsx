import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CatalogGrid } from "../CatalogGrid";
import { products } from "@/data/products";

describe("CatalogGrid", () => {
  it("filters products by search and category", async () => {
    const user = userEvent.setup();
    render(<CatalogGrid products={products} />);

    expect(
      screen.getByRole("complementary", { name: "Filtros do catálogo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("11 produtos")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: /buscar produtos/i }), "caneca");
    expect(screen.getByRole("heading", { name: "Caneca personalizada" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cartão de visita" })).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: /buscar produtos/i }));
    await user.click(
      screen.getByRole("radio", { name: "Brindes para sua empresa (3)" }),
    );
    expect(screen.getByRole("heading", { name: "Brindes corporativos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Caneca personalizada" })).toBeInTheDocument();
    expect(screen.getByText("3 produtos")).toBeInTheDocument();
  });

  it("sorts the visible products by name", async () => {
    const user = userEvent.setup();
    render(<CatalogGrid products={products} />);

    await user.selectOptions(screen.getByLabelText("Ordenar produtos"), "name-asc");

    expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent(
      "Adesivos e etiquetas",
    );
  });
});
