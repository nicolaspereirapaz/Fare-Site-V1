import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { temporaryAccessEnabled } from "@/lib/auth/temporaryAccess";

export const GUEST_COOKIE = "fare-temporary-visitor";
export const GUEST_MAX_AGE = 60 * 60 * 24 * 30;

function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Temporary access requires BETTER_AUTH_SECRET (at least 32 characters)");
  return createHmac("sha256", secret).update(`fare-temporary-visitor:${payload}`).digest("hex");
}

export function createGuestToken(now = Date.now()) {
  const payload = `${randomBytes(32).toString("hex")}.${Math.floor(now / 1000) + GUEST_MAX_AGE}`;
  return `${payload}.${signature(payload)}`;
}

/** No user-selected IDs, no shared customer, no trusted client headers. */
export function readGuestId(headers: Headers): string | null {
  if (!temporaryAccessEnabled()) return null;
  const token = (headers.get("cookie") ?? "").split(";").map(s => s.trim()).find(s => s.startsWith(`${GUEST_COOKIE}=`))?.slice(GUEST_COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}\.\d{10}\.[a-f0-9]{64}$/.test(token)) return null;
  const [id, expires, supplied] = token.split(".");
  if (Number(expires) <= Date.now() / 1000) return null;
  try {
    const expected = signature(`${id}.${expires}`);
    return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex")) ? `temporary-guest:${id}` : null;
  } catch {
    return null;
  }
}
