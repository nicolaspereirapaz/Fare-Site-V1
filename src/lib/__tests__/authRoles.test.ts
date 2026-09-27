import { describe, expect, it } from "vitest";
import { DEFAULT_USER_ROLE, isUserRole, USER_ROLES } from "@/lib/auth/roles";

describe("papéis de usuário", () => {
  it("usa cliente como papel padrão e aceita somente papéis conhecidos", () => {
    expect(DEFAULT_USER_ROLE).toBe("cliente");
    expect(USER_ROLES).toEqual(["cliente", "vendedor", "admin"]);
    expect(USER_ROLES.every(isUserRole)).toBe(true);
    expect(isUserRole("superadmin")).toBe(false);
    expect(isUserRole(null)).toBe(false);
  });
});
