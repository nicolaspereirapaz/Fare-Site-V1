import { createAuthClient } from "better-auth/react";
import { STAFF_AUTH_BASE_PATH } from "@/lib/staff/constants";

/** Cliente do login da equipe (outro endereço e outro cookie que o login de clientes). */
export const staffAuthClient = createAuthClient({ basePath: STAFF_AUTH_BASE_PATH });
