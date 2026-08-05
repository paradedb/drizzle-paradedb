import { desc, eq, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import { closeDb, db, mockItems, setupMockItems } from "./common.js";
import { search } from "../src/index.js";

type HybridRow = {
  id: number;
  description: string;
  rrfScore: number;
};

// In production, compute query embeddings with the same model that produced
// the stored embeddings. These fixed vectors stand in for that model.
const demos: { query: string; embedding: number[] }[] = [
  {
    query: "running shoes",
    embedding: [-0.02, 0.47, -0.76, 0.13, 0.34, 0.04, 0.19, -0.19],
  },
  {
    query: "footwear for exercise",
    embedding: [-0.04, 0.4, -0.66, -0.07, 0.43, 0.21, 0.39, -0.1],
  },
  {
    query: "wireless earbuds",
    embedding: [-0.08, 0.19, -0.88, 0.16, 0.3, 0.03, -0.08, -0.23],
  },
];

export async function runHybridRrf(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Hybrid Search with Reciprocal Rank Fusion (RRF)");
  console.log("=".repeat(60));
  console.log("\nSingle-query CTE: BM25 (keyword) + Vector (semantic)");
  console.log("RRF formula: score = sum(1 / (k + rank)) across all rankings");

  await setupMockItems();

  for (const { query, embedding } of demos) {
    await demo(query, embedding);
  }

  console.log("\n" + "=".repeat(70));
  console.log("All results produced by a single SQL query per search.");
  console.log("=".repeat(70));
}

async function demo(query: string, embedding: number[]): Promise<void> {
  const results = await hybridSearch(query, embedding);

  console.log("\n" + "=".repeat(70));
  console.log(`Query: '${query}'`);
  console.log("=".repeat(70));

  for (const [index, item] of results.entries()) {
    console.log(
      `  ${index + 1}. ${item.description.slice(0, 60).padEnd(60)} (RRF: ${item.rrfScore.toFixed(4)})`,
    );
  }
}

async function hybridSearch(
  query: string,
  queryEmbedding: number[],
  topK = 20,
  rrfK = 60,
  limit = 5,
): Promise<HybridRow[]> {
  const vectorDistance = search.cosineDistance(
    mockItems.embedding,
    queryEmbedding,
  );
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
  // The search.all() predicate is required: without a @@@ predicate the index
  // cannot serve the query and Postgres falls back to a sequential scan.
  const semantic = db.$with("semantic").as(
    db
      .select({
        id: mockItems.id,
        rank: sql<number>`row_number() over (order by ${vectorDistance})`.as(
          "rank",
        ),
      })
      .from(mockItems)
      .where(search.all(mockItems.id))
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
