import { database } from "@/lib/auth";
import { staffAuth } from "@/lib/staff/auth";
import { createListBackofficeQuotesHandler } from "@/lib/backoffice/quotesAccess";
import { listAllQuotes } from "@/lib/quotes/repository";

export const dynamic = "force-dynamic";

export const GET = createListBackofficeQuotesHandler(staffAuth.api.getSession, () => listAllQuotes(database));
