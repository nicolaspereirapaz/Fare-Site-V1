import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DirectOrderFields } from "@/components/staff/DirectOrderFields";
import type { ClosingChoice } from "@/components/staff/QuoteClosingFields";
import { EMPTY_PAYMENT_FORM } from "@/components/staff/paymentFieldsShared";
function Harness() {
  const [value, setValue] = useState({ ...EMPTY_PAYMENT_FORM, paid: "" });
  const [choice, setChoice] = useState<ClosingChoice>(null);
  return <DirectOrderFields choice={choice} onChange={setValue} onChoice={setChoice} total={80} value={value} />;
}
it("pedido direto usa os mesmos campos de Fechar Orçamento", async () => {
  const user = userEvent.setup(); render(<Harness />);
  expect(screen.getByText("Quanto o cliente pagou?")).toBeInTheDocument();
  expect(screen.getByLabelText("Data prevista de entrega")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /50% de sinal/ }));
  expect(screen.getByLabelText("Valor recebido agora")).toHaveValue("40,00");
  await user.click(screen.getByRole("button", { name: /Total na retirada/ }));
  expect(screen.queryByLabelText("Forma de pagamento")).not.toBeInTheDocument();
});
describe("campos por forma de pagamento", () => {
  it("parcelas apenas no crédito e vencimento no boleto/faturamento", async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.selectOptions(screen.getByLabelText("Forma de pagamento"), "cartao_credito");
    expect(screen.getByLabelText("Parcelas")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Forma de pagamento"), "boleto");
    expect(screen.queryByLabelText("Parcelas")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Vencimento")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Forma de pagamento"), "dinheiro");
    expect(screen.queryByLabelText("Vencimento")).not.toBeInTheDocument();
  });
});
