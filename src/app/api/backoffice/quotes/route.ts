import { database } from "@/lib/auth";
import { readStaffSession } from "@/lib/staff/server";
import { createListBackofficeQuotesHandler } from "@/lib/backoffice/quotesAccess";
import { listAllQuotes } from "@/lib/quotes/repository";

export const dynamic = "force-dynamic";

export const GET = createListBackofficeQuotesHandler(readStaffSession, () => listAllQuotes(database));
