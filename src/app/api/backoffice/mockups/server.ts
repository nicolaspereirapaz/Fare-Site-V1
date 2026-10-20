import { database } from "@/lib/auth";
import { createMockupHandlers } from "@/lib/backoffice/mockups";
import { catalogImageOf } from "@/lib/proposals/catalogImages";
import { readStaffSession } from "@/lib/staff/server";

export const mockups = createMockupHandlers({ getSession: readStaffSession, database: () => database, productImageOf: catalogImageOf });
