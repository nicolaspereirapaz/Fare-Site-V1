import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PickupActions } from "@/components/staff/PickupActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const finance = { paidCents: 2000, balanceCents: 3000, createdBy: "Bia", internalNotes: "", deliveryDate: null, deliveryMode: "retirada" as const, installments: null, dueDate: null, payments: [] };
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

it("falta pagar: um botão só, Registrar pagamento; pago, vira Cliente retirou", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ finance: { ...finance, paidCents: 5000, balanceCents: 0 } })));
  const user = userEvent.setup();
  render(<PickupActions code="PED-0001" customerName="Ana" finance={finance} orderId="o1" paymentMethod="pix" />);
  expect(screen.queryByRole("button", { name: "Cliente retirou" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Registrar pagamento" }));
  await user.click(screen.getByRole("button", { name: "Confirmar recebimento" }));
  expect(await screen.findByRole("button", { name: "Cliente retirou" })).toBeEnabled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(refresh).toHaveBeenCalled();
});

it("quitado: Cliente retirou marca entregue; entrega mostra Entregue", async () => {
  const send = vi.fn().mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", send);
  const user = userEvent.setup();
  const { rerender } = render(<PickupActions code="PED-0001" customerName="Ana" finance={{ ...finance, paidCents: 5000, balanceCents: 0 }} orderId="o1" paymentMethod="pix" />);
  await user.click(screen.getByRole("button", { name: "Cliente retirou" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith("/api/backoffice/orders/o1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "concluido" }) })));
  rerender(<PickupActions code="PED-0001" customerName="Ana" finance={{ ...finance, paidCents: 5000, balanceCents: 0, deliveryMode: "entrega" }} orderId="o1" paymentMethod="pix" />);
  expect(screen.getByRole("button", { name: "Entregue" })).toBeInTheDocument();
});
