import { mockups } from "../server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ file: string }> }) {
  return mockups.serve(request, (await context.params).file);
}
