import { and, desc, sql } from "drizzle-orm";
import { search } from "@paradedb/drizzle-paradedb";
import { db, client } from "./db.js";
import { articles } from "./schema.js";

async function main() {
  console.log("=== 🚀 ParadeDB + Drizzle ORM Full-Text & Vector Search Demo ===\n");

  try {
    // 1. Setup Table & BM25 Index
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_search;`);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
    await db.execute(sql`DROP TABLE IF EXISTS articles CASCADE;`);

    await db.execute(sql`
      CREATE TABLE articles (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        published BOOLEAN DEFAULT true,
        metadata JSONB,
        embedding vector(4)
      );
    `);

    await db.execute(sql`
      CREATE INDEX articles_search_idx ON articles
      USING paradedb (id, title, content, category, embedding vector_cosine_ops);
    `);

    console.log("✅ Created table 'articles' and BM25 index 'articles_search_idx'.\n");

    // 2. Insert Sample Data
    await db.insert(articles).values([
      {
        title: "PostgreSQL Full-Text Search Revolution",
        content: "ParadeDB integrates Tantivy directly inside Postgres for blazing fast BM25 search.",
        category: "Databases",
        embedding: [0.1, 0.9, 0.05, 0.2],
      },
      {
        title: "Building Modern Web Apps with TypeScript and Drizzle",
        content: "Type-safe SQL queries with Drizzle ORM make writing database queries intuitive and secure.",
        category: "Web Development",
        embedding: [0.8, 0.1, 0.4, 0.0],
      },
      {
        title: "Hybrid Search with Vectors and BM25",
        content: "Combine semantic vector embeddings with keyword BM25 scoring inside a single Postgres instance.",
        category: "Databases",
        embedding: [0.3, 0.7, 0.2, 0.8],
      },
    ]);
    console.log("✅ Seeded sample articles.\n");

    // 3. BM25 Match Query with Scoring
    console.log("🔍 [Demo 1] BM25 Match Query for 'Postgres Tantivy' with Scores:");
    const bm25Results = await db
      .select({
        id: articles.id,
        title: articles.title,
        bm25Score: search.score(articles.id),
      })
      .from(articles)
      .where(search.matchAny(articles.content, "Postgres Tantivy"))
      .orderBy(desc(search.score(articles.id)));

    console.table(bm25Results);

    // 4. Highlighted Snippets
    console.log("\n✂️ [Demo 2] Text Snippets with Custom Highlight Tags:");
    const snippetResults = await db
      .select({
        id: articles.id,
        title: articles.title,
        highlighted: search.snippet(articles.content, {
          startTag: "<mark>",
          endTag: "</mark>",
          maxNumChars: 60,
        }),
      })
      .from(articles)
      .where(search.matchAll(articles.content, "ParadeDB Tantivy"));

    console.table(snippetResults);

    // 5. Fuzzy Search (Typo Tolerance)
    console.log("\n🎯 [Demo 3] Fuzzy Search for typo 'PostgreSQLL' (distance = 1):");
    const fuzzyResults = await db
      .select({
        id: articles.id,
        title: articles.title,
      })
      .from(articles)
      .where(search.fuzzy(articles.title, 1));

    console.table(fuzzyResults);

  } catch (error) {
    console.error("Demo failed:", error);
  } finally {
    await client.end();
  }
}

main();
