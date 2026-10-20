import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ id: "temporary-guest:abc" }));
vi.mock("@/lib/auth/server", () => ({ getCurrentSession: async () => ({ user: { id: state.id, name: "Visitante", email: "" } }) }));
vi.mock("@/lib/auth", () => ({ database: {} }));
vi.mock("@/lib/account/profileRepository", () => ({ getCustomerProfile: () => ({}) }));
vi.mock("@/lib/account/profile", () => ({ isProfileComplete: () => false }));
vi.mock("@/components/account/AccountProfileForm", () => ({ AccountProfileForm: () => <div>Faturamento validado</div> }));
vi.mock("@/components/account/ChangePasswordForm", () => ({ ChangePasswordForm: () => <div>Alterar senha</div> }));
import Page from "@/app/(loja)/minha-conta/dados/page";
it("hides password/account controls for visitors but retains billing form and real-account password", async () => {
  const guest = renderToStaticMarkup(await Page());
  expect(guest).not.toContain("Alterar senha");
  expect(guest).toContain("Faturamento validado");
  state.id = "real-customer";
  expect(renderToStaticMarkup(await Page())).toContain("Alterar senha");
});
