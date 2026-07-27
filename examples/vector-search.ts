import { eq, sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { readFile } from "node:fs/promises";

import { closeDb, db } from "./common.js";
import { indexing, search } from "../src/index.js";

const vectorItems = pgTable(
  "vector_search_items",
  {
    id: integer("id").primaryKey(),
    description: text("description").notNull(),
    embedding: indexing.vector("embedding", { dimensions: 384 }),
  },
  (table) => [
    indexing
      .paradedbIndex("vector_search_items_idx")
      .on(
        table.id,
        table.description,
        indexing.vectorField(table.embedding, "cosine"),
      ),
  ],
);

export async function runVectorSearch(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Vector Search inside a ParadeDB Index");
  console.log("=".repeat(60));
  console.log("\nTop-K nearest neighbors served by the paradedb index.");
  console.log("A @@@ predicate and a LIMIT are required for index pushdown.");

  try {
    await setupVectorItems();
  } catch (error) {
    console.log(
      `\nSkipped: requires pg_search with vector support (${String(error)})`,
    );
    return;
  }

  await semanticSearch("Sturdy hiking boots");
  await filteredSemanticSearch("Sturdy hiking boots", "shoes");

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
}

async function setupVectorItems(): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`DROP TABLE IF EXISTS vector_search_items CASCADE`);
  await db.execute(sql`
    CREATE TABLE vector_search_items (
      id integer PRIMARY KEY,
      description text NOT NULL,
      embedding vector(384)
    )
  `);

  await db.insert(vectorItems).values(await loadItems());

  await db.execute(sql`
    CREATE INDEX vector_search_items_idx ON vector_search_items
    USING paradedb (id, description, embedding vector_cosine_ops)
    WITH (key_field='id')
  `);
  console.log("\n✓ Indexed vector_search_items with a cosine vector field");
}

async function loadItems(): Promise<
  { id: number; description: string; embedding: number[] }[]
> {
  const csv = await readFile(
    new URL("./hybrid_rrf/mock_items_embeddings.csv", import.meta.url),
    "utf8",
  );

  return csv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = line.match(/^(\d+),(.*),"(\[.*\])"$/);
      if (!match) throw new Error(`Invalid embedding CSV row: ${line}`);
      return {
        id: Number(match[1]),
        description: match[2],
        embedding: JSON.parse(match[3]) as number[],
      };
    });
}

async function queryEmbedding(description: string): Promise<number[]> {
  const [row] = await db
    .select({ embedding: vectorItems.embedding })
    .from(vectorItems)
    .where(eq(vectorItems.description, description))
    .limit(1);

  if (!row?.embedding) throw new Error(`No embedding for '${description}'`);
  return row.embedding;
}

async function semanticSearch(description: string): Promise<void> {
  console.log(`\n--- Nearest neighbors of: '${description}' ---`);

  const embedding = await queryEmbedding(description);
  const distance = search.cosineDistance(vectorItems.embedding, embedding);

  for (const item of await db
    .select({
      description: vectorItems.description,
      distance: sql<number>`(${distance})::float8`,
    })
    .from(vectorItems)
    .where(search.all(vectorItems.id))
    .orderBy(distance)
    .limit(5)) {
    console.log(
      `  • ${item.description.padEnd(40)} (distance: ${item.distance.toFixed(4)})`,
    );
  }
}

async function filteredSemanticSearch(
  description: string,
  keyword: string,
): Promise<void> {
  console.log(
    `\n--- Nearest neighbors of: '${description}' matching '${keyword}' ---`,
  );

  const embedding = await queryEmbedding(description);
  const distance = search.cosineDistance(vectorItems.embedding, embedding);

  for (const item of await db
    .select({
      description: vectorItems.description,
      distance: sql<number>`(${distance})::float8`,
    })
    .from(vectorItems)
    .where(search.matchAll(vectorItems.description, keyword))
    .orderBy(distance)
    .limit(5)) {
    console.log(
      `  • ${item.description.padEnd(40)} (distance: ${item.distance.toFixed(4)})`,
    );
  }
}

try {
  await runVectorSearch();
} finally {
  await db
    .execute(sql`DROP TABLE IF EXISTS vector_search_items CASCADE`)
    .catch(() => undefined);
  await closeDb();
}
