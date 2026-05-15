import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  closeDb,
  db,
  mockItems,
  setupMockItems,
} from "./common.js";
import { search } from "../src/index.js";

export async function runQuickstart(): Promise<void> {
  console.log("=".repeat(60));
  console.log("drizzle-paradedb Quickstart Example");
  console.log("=".repeat(60));

  await setupMockItems();

  console.log("\n--- Basic Search: 'shoes' ---");
  for (const item of await db
    .select({ description: mockItems.description })
    .from(mockItems)
    .where(search.matchAll(mockItems.description, "shoes"))
    .limit(5)) {
    console.log(`  • ${item.description.slice(0, 60)}...`);
  }

  console.log("\n--- Scored Search: 'running' ---");
  for (const item of await db
    .select({
      description: mockItems.description,
      score: search.score(mockItems.id),
    })
    .from(mockItems)
    .where(search.matchAll(mockItems.description, "running"))
    .orderBy(desc(search.score(mockItems.id)))
    .limit(5)) {
    console.log(
      `  • ${item.description.slice(0, 50)}... (score: ${item.score.toFixed(2)})`,
    );
  }

  console.log("\n--- Phrase Search: 'running shoes' ---");
  for (const item of await db
    .select({
      description: mockItems.description,
      score: search.score(mockItems.id),
    })
    .from(mockItems)
    .where(search.phrase(mockItems.description, "running shoes"))
    .orderBy(desc(search.score(mockItems.id)))
    .limit(5)) {
    console.log(
      `  • ${item.description.slice(0, 50)}... (score: ${item.score.toFixed(2)})`,
    );
  }

  console.log("\n--- Snippet Highlighting: 'shoes' ---");
  for (const item of await db
    .select({
      snippet: search.snippet(mockItems.description, {
        startTag: "<b>",
        endTag: "</b>",
      }),
      score: search.score(mockItems.id),
    })
    .from(mockItems)
    .where(search.matchAll(mockItems.description, "shoes"))
    .orderBy(desc(search.score(mockItems.id)))
    .limit(3)) {
    console.log(`  • ${item.snippet}`);
  }

  console.log("\n--- Filtered Search: 'shoes' + in_stock + rating >= 4 ---");
  for (const item of await db
    .select({
      description: mockItems.description,
      rating: mockItems.rating,
      score: search.score(mockItems.id),
    })
    .from(mockItems)
    .where(
      and(
        search.matchAll(mockItems.description, "shoes"),
        eq(mockItems.inStock, true),
        gte(mockItems.rating, 4),
      ),
    )
    .orderBy(desc(search.score(mockItems.id)))
    .limit(5)) {
    console.log(
      `  • ${item.description.slice(0, 40)}... (rating: ${item.rating})`,
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
}

try {
  await runQuickstart();
} finally {
  await db.execute(sql`DROP INDEX IF EXISTS search_idx`).catch(() => undefined);
  await closeDb();
}
