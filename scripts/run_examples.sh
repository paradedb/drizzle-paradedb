#!/usr/bin/env bash
set -euo pipefail

examples=(
  quickstart.ts
  faceted-search.ts
  vector-search.ts
  hybrid-rrf.ts
  rag.ts
  autocomplete.ts
  more-like-this.ts
)

if [ "$#" -gt 0 ]; then
  examples=("$@")
fi

for example in "${examples[@]}"; do
  tsx "examples/$example"
done
