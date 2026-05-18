#!/usr/bin/env bash
set -euo pipefail

examples=(
  quickstart.ts
  autocomplete.ts
  more-like-this.ts
  faceted-search.ts
  hybrid-rrf.ts
  rag.ts
)

if [ "$#" -gt 0 ]; then
  examples=("$@")
fi

for example in "${examples[@]}"; do
  tsx "examples/$example"
done
