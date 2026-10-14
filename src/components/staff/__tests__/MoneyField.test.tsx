import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("mostra o valor calculado como texto normal do campo", () => {
    render(<Harness calculated={1} />);
    expect(screen.getByLabelText("Custo")).toHaveValue("1,00");
  });

  it("apagar com backspace e digitar outro valor (como um usuário faz)", async () => {
    const user = userEvent.setup();
    render(<Harness calculated={1} />);
    const input = screen.getByLabelText("Custo");
    await user.click(input);
    await user.keyboard("{End}{Backspace}{Backspace}{Backspace}{Backspace}0,40");
    expect(input).toHaveValue("0,40");
    expect(screen.getByTestId("override")).toHaveTextContent("0,40");
    await user.tab();
    expect(input).toHaveValue("0,40");
    expect(input).toHaveClass("is-manual");
  });

  it("clicar no meio do número e digitar não gera valor inválido: só aceita número válido", async () => {
    const user = userEvent.setup();
    render(<Harness calculated={1} />);
    const input = screen.getByLabelText("Custo");
    await user.tripleClick(input);
    await user.keyboard("2,5");
    expect(screen.getByTestId("override")).toHaveTextContent("2,5");
    await user.tab();
    expect(input).toHaveValue("2,50");
  });

  it("apagar tudo e sair volta para o calculado; sair sem mudar continua automático", async () => {
    const user = userEvent.setup();
    render(<Harness calculated={1} />);
    const input = screen.getByLabelText("Custo");
    await user.tripleClick(input);
    await user.keyboard("{Backspace}");
    expect(input).toHaveValue("");
    await user.tab();
    expect(input).toHaveValue("1,00");
    expect(screen.getByTestId("override")).toHaveTextContent("(automático)");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.getByTestId("override")).toHaveTextContent("(automático)");
  });

  it("sem valor calculado ainda, dá para digitar direto", async () => {
    const user = userEvent.setup();
    render(<Harness calculated={null} />);
    const input = screen.getByLabelText("Custo");
    await user.click(input);
    await user.keyboard("3");
    expect(screen.getByTestId("override")).toHaveTextContent("3");
  });
});
