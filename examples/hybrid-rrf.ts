import { desc, eq, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { readFile } from "node:fs/promises";

import {
  closeDb,
  db,
  mockItems,
  setupMockItems,
} from "./common.js";
import { search } from "../src/index.js";

type HybridRow = {
  id: number;
  description: string;
  rrfScore: number;
};

export async function runHybridRrf(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Hybrid Search with Reciprocal Rank Fusion (RRF)");
  console.log("=".repeat(60));
  console.log("\nSingle-query CTE: BM25 (keyword) + Vector (semantic)");
  console.log("RRF formula: score = sum(1 / (k + rank)) across all rankings");

  try {
    await setupHybridItems();
  } catch (error) {
    console.log(`\nSkipped: pgvector setup failed (${String(error)})`);
    return;
  }

  await demo("running shoes");
  await demo("footwear for exercise");
  await demo("wireless earbuds");

  console.log("\n" + "=".repeat(70));
  console.log("All results produced by a single SQL query per search.");
  console.log("=".repeat(70));
}

async function setupHybridItems(): Promise<void> {
  await setupMockItems();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(
    sql`ALTER TABLE mock_items ADD COLUMN IF NOT EXISTS embedding vector(384)`,
  );

  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mockItems)
    .where(sql`embedding IS NOT NULL`);
  if (existing.count > 0) {
    console.log(`✓ ${existing.count} items already have embeddings`);
    return;
  }

  const rows = await loadEmbeddings();
  for (const row of rows) {
    await db.execute(sql`
      UPDATE mock_items
      SET embedding = ${row.embedding}::vector
      WHERE id = ${row.id}
    `);
  }
  console.log(`✓ Loaded ${rows.length} embeddings`);
}

async function loadEmbeddings(): Promise<{ id: number; embedding: string }[]> {
  const csv = await readFile(
    new URL("./hybrid_rrf/mock_items_embeddings.csv", import.meta.url),
    "utf8",
  );

  return csv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = line.match(/^(\d+),.*,"(\[.*\])"$/);
      if (!match) throw new Error(`Invalid embedding CSV row: ${line}`);
      return { id: Number(match[1]), embedding: match[2] };
    });
}

async function demo(query: string): Promise<void> {
  const queryEmbedding = await getQueryEmbedding(query);
  const results = await hybridSearch(query, queryEmbedding);

  console.log("\n" + "=".repeat(70));
  console.log(`Query: '${query}'`);
  console.log("=".repeat(70));

  for (const [index, item] of results.entries()) {
    console.log(
      `  ${index + 1}. ${item.description.slice(0, 60).padEnd(60)} (RRF: ${item.rrfScore.toFixed(4)})`,
    );
  }
}

async function getQueryEmbedding(query: string): Promise<string> {
  const sourceIds: Record<string, number> = {
    "running shoes": 3,
    "footwear for exercise": 3,
    "wireless earbuds": 12,
  };
  const [row] = await db
    .select({ embedding: sql<string>`embedding::text` })
    .from(mockItems)
    .where(eq(mockItems.id, sourceIds[query]))
    .limit(1);

  if (!row?.embedding) throw new Error(`No embedding found for '${query}'`);
  return row.embedding;
}

async function hybridSearch(
  query: string,
  queryEmbedding: string,
  topK = 20,
  rrfK = 60,
  limit = 5,
): Promise<HybridRow[]> {
  const vectorDistance = sql`embedding <=> ${queryEmbedding}::vector`;
  const fulltext = db.$with("fulltext").as(
    db
      .select({
        id: mockItems.id,
        rank: sql<number>`row_number() over (order by ${search.score(mockItems.id)} desc)`.as(
          "rank",
        ),
      })
      .from(mockItems)
      .where(search.matchAll(mockItems.description, query))
      .orderBy(desc(search.score(mockItems.id)))
      .limit(topK),
  );
  const semantic = db.$with("semantic").as(
    db
      .select({
        id: mockItems.id,
        rank: sql<number>`row_number() over (order by ${vectorDistance})`.as(
          "rank",
        ),
      })
      .from(mockItems)
      .where(sql`embedding IS NOT NULL`)
      .orderBy(vectorDistance)
      .limit(topK),
  );
  const rrf = db.$with("rrf").as(
    unionAll(
      db
        .select({
          id: fulltext.id,
          score: sql<number>`1.0 / (${rrfK} + ${fulltext.rank})`.as("score"),
        })
        .from(fulltext),
      db
        .select({
          id: semantic.id,
          score: sql<number>`1.0 / (${rrfK} + ${semantic.rank})`.as("score"),
        })
        .from(semantic),
    ),
  );
  const rrfScores = db.$with("rrf_scores").as(
    db
      .select({
        id: rrf.id,
        rrfScore: sql<number>`sum(${rrf.score})`.as("rrf_score"),
      })
      .from(rrf)
      .groupBy(rrf.id)
      .orderBy(desc(sql`sum(${rrf.score})`))
      .limit(limit),
  );

  return db
    .with(fulltext, semantic, rrf, rrfScores)
    .select({
      id: mockItems.id,
      description: mockItems.description,
      rrfScore: sql<number>`${rrfScores.rrfScore}::float8`,
    })
    .from(rrfScores)
    .innerJoin(mockItems, eq(mockItems.id, rrfScores.id))
    .orderBy(desc(rrfScores.rrfScore));
}

try {
  await runHybridRrf();
} finally {
  await closeDb();
}
