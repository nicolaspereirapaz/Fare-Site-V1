import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DirectOrderFields } from "@/components/staff/DirectOrderFields";
import { EMPTY_PAYMENT_FORM } from "@/components/staff/paymentFieldsShared";
function Harness() {
  const [value, setValue] = useState(EMPTY_PAYMENT_FORM);
  return <DirectOrderFields onChange={setValue} value={value} />;
}
it("pedido direto usa campos originais e não mostra o bloco financeiro removido", () => {
  const { container } = render(<Harness />);
  expect(screen.getByLabelText("Quanto o cliente já pagou (R$)")).toBeInTheDocument();
  expect(screen.getByLabelText("Data prevista de entrega")).toBeInTheDocument();
  expect(screen.queryByText("Registro para o financeiro")).not.toBeInTheDocument();
  expect(container.querySelectorAll('.qe-card')).toHaveLength(2);
});
describe("campos por forma de pagamento", () => {
  it("parcelas apenas no crédito e vencimento no boleto/faturamento", async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.selectOptions(screen.getByLabelText("Forma de pagamento"), "cartao_credito");
    expect(screen.getByLabelText("Parcelas")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Forma de pagamento"), "boleto");
    expect(screen.queryByLabelText("Parcelas")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Vencimento do boleto / faturamento")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Forma de pagamento"), "dinheiro");
    expect(screen.queryByLabelText("Vencimento do boleto / faturamento")).not.toBeInTheDocument();
  });
});
