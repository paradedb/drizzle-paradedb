import { mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

mkdirSync("coverage", { recursive: true });
const args = process.argv.slice(2);
const files = args.filter((arg) => arg.startsWith("tests/"));
const options = args.filter((arg) => !arg.startsWith("tests/"));
const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--test",
    "--experimental-test-coverage",
    "--test-coverage-include=src/**/*.ts",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=lcov",
    "--test-reporter-destination=coverage/lcov.info",
    ...options,
    ...(files.length
      ? files
      : readdirSync("tests")
          .filter((file) => file.endsWith(".test.ts"))
          .map((file) => `tests/${file}`)),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: "1" },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
