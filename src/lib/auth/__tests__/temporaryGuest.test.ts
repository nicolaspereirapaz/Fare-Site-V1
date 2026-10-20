// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createGuestToken, readGuestId, GUEST_COOKIE } from "../temporaryGuest";
afterEach(() => vi.unstubAllEnvs());
function setup() {
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-temporary-guest-cookie-only");
}
it("issues independent persisted visitor identities signed by the server", () => {
  setup();
  const a = createGuestToken(); const b = createGuestToken();
  expect(a).not.toBe(b);
  const headers = new Headers({cookie: `${GUEST_COOKIE}=${a}`});
  expect(readGuestId(headers)).toMatch(/^temporary-guest:[a-f0-9]{64}$/);
  expect(readGuestId(headers)).toBe(readGuestId(headers));
  expect(readGuestId(new Headers({cookie: `${GUEST_COOKIE}=${b}`}))).not.toBe(readGuestId(headers));
});
it("rejects tampering, arbitrary existing account IDs, expiry, and the disabled switch", () => {
  setup(); const token = createGuestToken();
  for (const value of ["existing-customer", `${token}x`, `${token[0] === "a" ? "b" : "a"}${token.slice(1)}`, createGuestToken(0)]) {
    expect(readGuestId(new Headers({cookie: `${GUEST_COOKIE}=${value}`}))).toBeNull();
  }
  vi.stubEnv("FARE_TEMPORARY_PASSWORDLESS", "0");
  expect(readGuestId(new Headers({cookie: `${GUEST_COOKIE}=${token}`}))).toBeNull();
});
it("fails closed without a signing secret", () => {
  setup(); vi.stubEnv("BETTER_AUTH_SECRET", undefined);
  expect(() => createGuestToken()).toThrow();
  expect(readGuestId(new Headers({cookie: `${GUEST_COOKIE}=anything`}))).toBeNull();
});
