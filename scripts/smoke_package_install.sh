#!/usr/bin/env bash
#
# smoke_package_install.sh
#
# Builds the npm package, installs the packed tarball into a throwaway project,
# and exercises the public API from it. This catches packaging problems the test
# suite cannot see, because the tests import from src/ while consumers get only
# whatever `files` and `exports` actually publish.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

PKG_NAME="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/drizzle-paradedb-smoke.XXXXXX")"
cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

echo "Building ${PKG_NAME}@${VERSION}..."
pnpm build >/dev/null

npm pack --pack-destination "${WORK_DIR}" >/dev/null
TARBALL="$(find "${WORK_DIR}" -maxdepth 1 -name '*.tgz' | head -1)"

if [[ -z "${TARBALL}" ]]; then
  echo "❌ npm pack produced no tarball" >&2
  exit 1
fi

# The published tarball must carry the build output and its type declarations.
for entry in package/dist/index.js package/dist/index.d.ts; do
  if ! tar -tzf "${TARBALL}" | grep -Fxq "${entry}"; then
    echo "❌ ${entry} missing from the packed tarball" >&2
    exit 1
  fi
done

APP_DIR="${WORK_DIR}/app"
mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

cat > package.json <<'JSON'
{
  "name": "drizzle-paradedb-smoke",
  "private": true,
  "version": "0.0.0",
  "type": "module"
}
JSON

npm install --no-audit --no-fund --silent "${TARBALL}" >/dev/null

cat > smoke.mjs <<JSON
import { integer, PgDialect, pgTable, text } from "drizzle-orm/pg-core";
import { search } from "${PKG_NAME}";

const mockItems = pgTable("mock_items", {
  id: integer("id").primaryKey(),
  description: text("description"),
});

const { sql } = new PgDialect().sqlToQuery(
  search.matchAll(mockItems.description, "running shoes"),
);

if (!sql.includes("&&&")) {
  console.error(\`Expected the ParadeDB match operator in: \${sql}\`);
  process.exit(1);
}

console.log("✅ Package smoke install passed for ${PKG_NAME}@${VERSION}");
JSON

node smoke.mjs
