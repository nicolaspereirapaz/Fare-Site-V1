import { quoteBuilderHandlers } from "@/lib/backoffice/quoteBuilderServer";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => quoteBuilderHandlers.searchCustomers(request);
export const POST = (request: Request) => quoteBuilderHandlers.createCustomer(request);
