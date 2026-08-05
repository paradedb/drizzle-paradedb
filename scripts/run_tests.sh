#!/usr/bin/env bash
#
# run_tests.sh
#
# Runs the full test suite against a local ParadeDB instance. Starts the
# container via scripts/run_paradedb.sh unless DATABASE_URL is already set.
# Extra arguments are forwarded to vitest.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  # shellcheck source=/dev/null
  source scripts/run_paradedb.sh
fi

pnpm test "$@"
