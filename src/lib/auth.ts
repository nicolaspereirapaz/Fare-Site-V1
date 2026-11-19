import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { buildAuthOptions } from "@/lib/auth/options";

const databasePath = process.env.AUTH_DATABASE_PATH ?? path.join(process.cwd(), "data", "farefoto.sqlite");
mkdirSync(path.dirname(databasePath), { recursive: true });

const globalAuth = globalThis as typeof globalThis & {
  fareFotoDatabase?: DatabaseSync;
};

// timeout: espera o banco ocupado (outro processo gravando: build em paralelo, backup) em vez de falhar na hora.
export const database = globalAuth.fareFotoDatabase ?? new DatabaseSync(databasePath, { timeout: 5000 });
if (process.env.NODE_ENV !== "production") globalAuth.fareFotoDatabase = database;

export const auth = betterAuth(buildAuthOptions(database));
