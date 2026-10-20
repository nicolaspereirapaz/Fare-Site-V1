// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { temporaryAccessEnabled, resolveTemporaryStaff } from "../temporaryAccess";

afterEach(() => vi.unstubAllEnvs());
it("requires the exact explicit switch; disabled is the default", () => {
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", undefined);
  expect(temporaryAccessEnabled()).toBe(false);
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "true");
  expect(temporaryAccessEnabled()).toBe(false);
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "1");
  expect(temporaryAccessEnabled()).toBe(true);
});
it("never opens on the production server, even with the switch on", () => {
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "1");
  vi.stubEnv("NODE_ENV", "production");
  expect(temporaryAccessEnabled()).toBe(false);
  expect(resolveTemporaryStaff(null)).toBeNull();
});
it("opens team as a labeled temporary admin, without impersonating employees", () => {
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "1");
  expect(resolveTemporaryStaff(null)).toEqual({ user: {
    id: "temporary-open-admin", name: "Acesso temporário — sem autenticação",
    email: "temporary-admin@invalid", role: "admin",
  }});
});
it("retains real signed-in staff and denies missing staff when disabled", () => {
  const real = { user: { id: "employee", name: "Ana", email: "ana@example.com", role: "vendedor" as const }};
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "1");
  expect(resolveTemporaryStaff(real)).toBe(real);
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "0");
  expect(resolveTemporaryStaff(null)).toBeNull();
  expect(resolveTemporaryStaff(real)).toBe(real);
});
