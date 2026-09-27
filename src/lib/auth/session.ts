export type SessionReader<T> = (context: { headers: Headers }) => Promise<T | null>;

export async function readVerifiedSession<T>(
  requestHeaders: Headers,
  getSession: SessionReader<T>,
): Promise<T | null> {
  return getSession({ headers: requestHeaders });
}
