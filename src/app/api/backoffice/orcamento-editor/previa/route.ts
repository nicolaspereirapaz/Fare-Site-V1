import { quoteBuilderHandlers } from "@/lib/backoffice/quoteBuilderServer";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => quoteBuilderHandlers.preview(request);
