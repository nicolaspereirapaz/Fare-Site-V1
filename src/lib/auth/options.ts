import type { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "better-auth";
import { DEFAULT_USER_ROLE } from "@/lib/auth/roles";

export function buildAuthOptions(database: DatabaseSync): BetterAuthOptions {
  return {
    database,
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: DEFAULT_USER_ROLE,
          input: false,
        },
      },
    },
  };
}
