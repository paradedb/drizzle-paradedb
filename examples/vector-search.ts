import { sql } from "drizzle-orm";

import { closeDb, db, mockItems, setupMockItems } from "./common.js";
import { search } from "../src/index.js";

// In production, compute query embeddings with the same model that produced
// the stored embeddings. This fixed vector stands in for that model.
const queryEmbedding = [-0.02, 0.47, -0.76, 0.13, 0.34, 0.04, 0.19, -0.19];

export async function runVectorSearch(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Vector Search inside a ParadeDB Index");
  console.log("=".repeat(60));
  console.log("\nTop-K nearest neighbors served by the paradedb index.");
  console.log("A @@@ predicate and a LIMIT are required for index pushdown.");

  await setupMockItems();

  await nearestNeighbors();
  await filteredNearestNeighbors("Footwear");

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
}

async function nearestNeighbors(): Promise<void> {
  console.log("\n--- Nearest neighbors across all items ---");

  const distance = search.cosineDistance(mockItems.embedding, queryEmbedding);

  for (const item of await db
    .select({
      description: mockItems.description,
      distance: sql<number>`(${distance})::float8`,
    })
    .from(mockItems)
    .where(search.all(mockItems.id))
    .orderBy(distance)
    .limit(5)) {
    console.log(
      `  • ${item.description.padEnd(40)} (distance: ${item.distance.toFixed(4)})`,
    );
  }
}

async function filteredNearestNeighbors(category: string): Promise<void> {
  console.log(`\n--- Nearest neighbors in category '${category}' ---`);

  const distance = search.cosineDistance(mockItems.embedding, queryEmbedding);

  for (const item of await db
    .select({
      description: mockItems.description,
      distance: sql<number>`(${distance})::float8`,
    })
    .from(mockItems)
    .where(search.term(mockItems.category, category))
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
  await closeDb();
}
