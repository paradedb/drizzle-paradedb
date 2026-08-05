# Examples

Self-contained scripts that show how to use ParadeDB from Drizzle. Run them all with `pnpm examples`, or follow the setup below and run them one at a time.

## Getting Started

### 1. Install dependencies

```bash
# Install pnpm: https://pnpm.io/installation
pnpm install
```

### 2. Start ParadeDB

```bash
pnpm db:setup
```

This starts a ParadeDB container via Docker and exports `DATABASE_URL`. If you already have a Postgres instance with ParadeDB installed, set `DATABASE_URL` yourself instead:

```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

## Quickstart (`quickstart.ts`)

The "Hello World" of ParadeDB. Covers declaring a ParadeDB index on a table, running keyword queries, sorting by BM25 relevance, and highlighting matched terms in snippets.

```bash
pnpm examples quickstart.ts
```

## Vector Search (`vector-search.ts`)

Top-K nearest-neighbor retrieval over pgvector `vector` columns. ParadeDB indexes the vector column inside its search index, so one index serves both keyword and vector queries.

Requires the `pgvector` extension, which is included in the ParadeDB Docker image.

```bash
pnpm examples vector-search.ts
```

## Faceted Search (`faceted-search.ts`)

Builds an e-commerce-style filter sidebar. Computes search results and facet counts (by category, rating, and so on) together in a single query.

```bash
pnpm examples faceted-search.ts
```

## Autocomplete (`autocomplete.ts`)

As-you-type suggestions using n-gram tokenization, which matches substrings in the middle of words — typing `wir` matches `wireless`.

```bash
pnpm examples autocomplete.ts
```

## More Like This (`more-like-this.ts`)

"Related content" recommendations. Finds documents with similar keywords using TF-IDF logic, without requiring vector embeddings.

```bash
pnpm examples more-like-this.ts
```

## Hybrid Search (RRF) (`hybrid-rrf.ts`)

Combines BM25 keyword search (good for exact matches like part numbers) with vector similarity (good for meaning) using Reciprocal Rank Fusion, which ranks better than either method alone.

Requires the `pgvector` extension, which is included in the ParadeDB Docker image.

```bash
pnpm examples hybrid-rrf.ts
```

## RAG (`rag.ts`)

A small question-answering flow. Retrieves relevant context with ParadeDB, then sends it to an LLM so answers are grounded in your own data.

Requires an [OpenRouter](https://openrouter.ai/) API key:

```bash
export OPENROUTER_API_KEY=sk-...
pnpm examples rag.ts
```

## Shared Helpers (`common.ts`)

Most examples import from `examples/common.ts`, which keeps the boilerplate out of the example scripts: it opens the connection, defines the demo table, and seeds it with data.
