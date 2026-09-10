/**
 * Runs the parser tests with zero dependencies.
 *
 * Node can execute TypeScript directly (--experimental-strip-types) but its
 * ESM resolver needs explicit file extensions, while Next.js code is written
 * extensionless. So we stage a copy with rewritten specifiers and run that —
 * the app source stays idiomatic and the tests stay runnable with no install.
 *
 *   npm test
 */

import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, ".test-tmp");

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// Stage lib/*.ts with extension-qualified relative imports.
for (const file of readdirSync(join(root, "lib")).filter((f) => f.endsWith(".ts"))) {
  const src = readFileSync(join(root, "lib", file), "utf8");
  writeFileSync(join(tmp, file), src.replace(/from "\.\/([A-Za-z0-9_-]+)"/g, 'from "./$1.ts"'));
}

// Stage the test, pointing it at the staged libs.
const test = readFileSync(join(root, "scripts", "test-parser.ts"), "utf8");
writeFileSync(
  join(tmp, "test-parser.ts"),
  test.replace(/from "\.\.\/lib\/([A-Za-z0-9_-]+)(\.ts)?"/g, 'from "./$1.ts"'),
);

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings", join(tmp, "test-parser.ts")],
  { stdio: "inherit" },
);

rmSync(tmp, { recursive: true, force: true });
process.exit(result.status ?? 1);
