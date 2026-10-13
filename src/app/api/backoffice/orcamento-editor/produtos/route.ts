import { quoteBuilderHandlers } from "@/lib/backoffice/quoteBuilderServer";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => quoteBuilderHandlers.searchProducts(request);
