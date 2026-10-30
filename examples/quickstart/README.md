# ParadeDB + Drizzle ORM Quickstart Example

This example demonstrates how to use [`@paradedb/drizzle-paradedb`](https://github.com/paradedb/drizzle-paradedb) to perform BM25 full-text search, snippet highlighting, and typo-tolerant fuzzy search in TypeScript with **Drizzle ORM**.

---

## Prerequisites

1. **PostgreSQL** running with the `pg_search` extension enabled (e.g. via ParadeDB Docker):
   ```bash
   docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres paradedb/paradedb:latest
   ```
2. **Node.js** (v22.12+)

---

## What this example demonstrates

1. **Schema Definition with Index Builders**:
   Defining a ParadeDB index on multiple fields with custom tokenizers (`icu`, `unicodeWords`, `literal`) and vector metrics directly inside a Drizzle `pgTable` schema:
   ```typescript
   export const articles = pgTable("articles", { ... }, (table) => [
     paradedbIndex("articles_search_idx").on(
       table.id,
       paradedbField(table.title, tokenizer.unicodeWords()),
       paradedbField(table.content, tokenizer.icu({ stemmer: "english" }))
     )
   ]);
   ```

2. **BM25 Search & Scoring**:
   Querying with `search.matchAny` and ordering by BM25 relevance score:
   ```typescript
   const results = await db
     .select({
       title: articles.title,
       score: search.score(articles.id),
     })
     .from(articles)
     .where(search.matchAny(articles.content, "Postgres Tantivy"))
     .orderBy(desc(search.score(articles.id)));
   ```

3. **Snippet Extraction & Highlighting**:
   Extracting dynamic text fragments around search hits with custom tags (`<mark>...</mark>`):
   ```typescript
   const snippets = await db
     .select({
       snippet: search.snippet(articles.content, {
         startTag: "<mark>",
         endTag: "</mark>",
       })
     })
     .from(articles)
     .where(search.matchAll(articles.content, "ParadeDB"));
   ```

4. **Typo Tolerance (Fuzzy Search)**:
   Handling misspellings using Levenshtein distance:
   ```typescript
   search.fuzzy(articles.title, 1) // distance = 1
   ```
