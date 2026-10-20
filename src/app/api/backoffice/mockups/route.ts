import { mockups } from "./server";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => mockups.upload(request);
export const DELETE = (request: Request) => mockups.remove(request);
