// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]);
}
it("all application API and backoffice readers use the centralized temporary-aware session readers", () => {
  const roots = ["src/app/api", "src/lib/backoffice", "src/lib/proposals"];
  const offenders = roots.flatMap(files).filter(p => !p.includes("__tests__") && /\.tsx?$/.test(p))
    .filter(p => /(?:staffAuth|auth)\.api\.getSession/.test(readFileSync(p,"utf8")));
  expect(offenders).toEqual([]);
});
