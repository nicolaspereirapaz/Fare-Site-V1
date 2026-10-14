import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MoneyField } from "@/components/staff/ProductConfigModal";

function Harness({ calculated }: { calculated: number | null }) {
  const [value, setValue] = useState("");
  return (
    <>
      <MoneyField ariaLabel="Custo" calculated={calculated} onChange={setValue} value={value} />
      <output data-testid="override">{value || "(automático)"}</output>
    </>
  );
}

describe("campo de valor editável (custo da gravação, custo e preço)", () => {
  it("ao clicar, o valor calculado vira texto editável no campo", () => {
    render(<Harness calculated={1} />);
    const input = screen.getByLabelText("Custo") as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.focus(input);
    expect(input.value).toBe("1,00");
    fireEvent.change(input, { target: { value: "0,75" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("override")).toHaveTextContent("0,75");
    expect(input).toHaveClass("is-manual");
  });

  it("clicar e sair sem mudar continua automático", () => {
    render(<Harness calculated={1} />);
    const input = screen.getByLabelText("Custo");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.getByTestId("override")).toHaveTextContent("(automático)");
  });

  it("sem valor calculado ainda, dá para digitar direto", () => {
    render(<Harness calculated={null} />);
    const input = screen.getByLabelText("Custo") as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "2,5" } });
    expect(screen.getByTestId("override")).toHaveTextContent("2,5");
  });
});
