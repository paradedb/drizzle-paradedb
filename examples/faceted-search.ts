import { desc } from "drizzle-orm";

import { closeDb, db, mockItems, setupMockItems } from "./common.js";
import { search } from "../src/index.js";

type FacetBucket = { key: unknown; doc_count?: number };
type FacetResult = { buckets?: FacetBucket[] };

export async function runFacetedSearch(): Promise<void> {
  console.log("=".repeat(60));
  console.log("drizzle-paradedb Faceted Search Example");
  console.log("=".repeat(60));

  await setupMockItems();

  const query = "shoes";
  console.log(`\nQuery: '${query}'`);
  console.log("\n--- Facets + Rows (Top K) ---");

  const rows = await db
    .select({
      description: mockItems.description,
      category: mockItems.category,
      rating: mockItems.rating,
      inStock: mockItems.inStock,
      metadata: mockItems.metadata,
      categoryFacet: search
        .agg({ terms: { field: "category", order: { _count: "desc" } } })
        .over(),
      ratingFacet: search
        .agg({ terms: { field: "rating", order: { _count: "desc" } } })
        .over(),
      colorFacet: search
        .agg({ terms: { field: "metadata.color", order: { _count: "desc" } } })
        .over(),
    })
    .from(mockItems)
    .where(search.matchAll(mockItems.description, query))
    .orderBy(desc(mockItems.rating))
    .limit(5);

  console.log("Top results:");
  for (const item of rows) {
    const color = item.metadata?.color ?? "N/A";
    const stock = item.inStock ? "In Stock" : "Out of Stock";
    console.log(
      `  • ${item.description.slice(0, 50)}... [${item.category}] (rating: ${item.rating}, ${stock}, color: ${color})`,
    );
  }

  console.log("\nFacet buckets:");
  printFacet("category_terms", rows[0]?.categoryFacet);
  printFacet("rating_terms", rows[0]?.ratingFacet);
  printFacet("metadata.color_terms", rows[0]?.colorFacet);

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
}

function printFacet(name: string, facet: unknown): void {
  const buckets = ((facet as FacetResult | undefined)?.buckets ?? []).slice(
    0,
    8,
  );
  console.log(`${name} (${buckets.length} buckets)`);
  for (const bucket of buckets) {
    console.log(`  • ${bucket.key}: ${bucket.doc_count}`);
  }
}

try {
  await runFacetedSearch();
} finally {
  await closeDb();
}
