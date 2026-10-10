import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { migrateStaffDatabase } from "@/lib/staff/members";
import { buildStaffAuthOptions } from "@/lib/staff/options";

/** Banco só da equipe (contas, sessões e convites), separado das contas de clientes. */
export const staffDatabasePath = process.env.STAFF_DATABASE_PATH ?? path.join(process.cwd(), "data", "equipe.sqlite");
mkdirSync(path.dirname(staffDatabasePath), { recursive: true });

const globalStaff = globalThis as typeof globalThis & { fareStaffDatabase?: DatabaseSync };
export const staffDatabase = globalStaff.fareStaffDatabase ?? new DatabaseSync(staffDatabasePath);
if (process.env.NODE_ENV !== "production") globalStaff.fareStaffDatabase = staffDatabase;
migrateStaffDatabase(staffDatabase);

export const staffAuth = betterAuth(buildStaffAuthOptions(staffDatabase));
