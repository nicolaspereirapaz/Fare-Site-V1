// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ store: vi.fn(), staff: vi.fn() }));
vi.mock("@/lib/auth", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  return { auth: { api: { getSession: mocks.store } }, database: new DatabaseSync(":memory:") };
});
vi.mock("@/lib/staff/auth", () => ({ staffAuth: { api: { getSession: mocks.staff } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { getStoreSession } from "../storeSession";
import { getStaffSession } from "@/lib/staff/server";
import { createGuestToken, GUEST_COOKIE } from "../temporaryGuest";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
beforeEach(() => {
  vi.stubEnv("FARE_FULL_SITE", "1"); vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-temporary-guest-cookie-only");
  mocks.store.mockResolvedValue(null); mocks.staff.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
it("central staff reader opens pages/APIs and returns to normal with one toggle", async () => {
  expect((await getStaffSession(new Headers()))?.user.id).toBe("temporary-open-admin");
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "0");
  expect(await getStaffSession(new Headers())).toBeNull();
});
it("proxy issues HttpOnly cookie and forwards the same signed token to the first render", () => {
  const response = proxy(new NextRequest("http://localhost:3000/brindes"));
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  expect(response.headers.get("x-middleware-request-cookie")).toContain(GUEST_COOKIE);
});
it("store fallback persists only its own identity; signed-in account wins", async () => {
  const headers = new Headers({ cookie: `${GUEST_COOKIE}=${createGuestToken()}` });
  const first = await getStoreSession({headers});
  expect(first?.user.id).toMatch(/^temporary-guest:/);
  expect((await getStoreSession({headers}))?.user.id).toBe(first?.user.id);
  expect(await getStoreSession({headers: new Headers()})).toBeNull();
  const real = { user: { id: "real", name: "Real", email: "real@example.com" }};
  mocks.store.mockResolvedValue(real);
  expect(await getStoreSession({headers})).toBe(real);
  mocks.store.mockResolvedValue(null);
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "0");
  expect(await getStoreSession({headers})).toBeNull();
});
