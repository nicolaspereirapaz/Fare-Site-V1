import { mockups } from "../server";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => mockups.productPhoto(request);
