import { and, desc, eq, gte, inArray, not, or } from "drizzle-orm";

import {
  closeDb,
  db,
  mockItems,
  setupMockItems,
} from "./common.js";
import { search } from "../src/index.js";

export async function runMoreLikeThis(): Promise<void> {
  console.log("=".repeat(60));
  console.log("drizzle-paradedb MoreLikeThis Example");
  console.log("Find similar documents without vector embeddings");
  console.log("=".repeat(60));

  await setupMockItems();

  await demoSimilarToSingleProduct();
  await demoSimilarToMultipleProducts();
  await demoSimilarByDocument();
  await demoTuningParameters();
  await demoCombinedWithFilters();
  await demoMultifieldSimilarity();

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
}

async function demoSimilarToSingleProduct(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 1: Similar to a single product");
  console.log("=".repeat(60));

  const sourceId = 3;
  const [source] = await db
    .select()
    .from(mockItems)
    .where(eq(mockItems.id, sourceId))
    .limit(1);

  console.log(`\nSource product (id=${sourceId}):`);
  console.log(`  '${source.description}' [${source.category}]`);

  console.log("\nSimilar products (by description):");
  const similar = await db
    .select({
      id: mockItems.id,
      description: mockItems.description,
      category: mockItems.category,
      score: search.score(mockItems.id),
    })
    .from(mockItems)
    .where(
      search.moreLikeThisId(mockItems.id, sourceId, {
        fields: ["description"],
      }),
    )
    .orderBy(desc(search.score(mockItems.id)))
    .limit(5);

  for (const item of similar) {
    const marker = item.id === sourceId ? " (source)" : "";
    console.log(
      `  ${item.id}: ${item.description.slice(0, 50)}... [${item.category}]${marker}`,
    );
  }
}

async function demoSimilarToMultipleProducts(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 2: Similar to multiple products (browsing history)");
  console.log("=".repeat(60));

  const browsedIds = [3, 12, 29];
  const browsed = await db
    .select()
    .from(mockItems)
    .where(inArray(mockItems.id, browsedIds));

  console.log("\nUser's browsing history:");
  for (const item of browsed) {
    console.log(
      `  ${item.id}: ${item.description.slice(0, 50)}... [${item.category}]`,
    );
  }

  console.log("\nRecommended products (similar to any browsed item):");
  const similar = await db
    .select({
      id: mockItems.id,
      description: mockItems.description,
      category: mockItems.category,
    })
    .from(mockItems)
    .where(
      and(
        or(
          ...browsedIds.map((id) =>
            search.moreLikeThisId(mockItems.id, id, {
              fields: ["description"],
            }),
          ),
        ),
        not(inArray(mockItems.id, browsedIds)),
      ),
    )
    .orderBy(desc(search.score(mockItems.id)))
    .limit(5);

  for (const item of similar) {
    console.log(
      `  ${item.id}: ${item.description.slice(0, 50)}... [${item.category}]`,
    );
  }
}

async function demoSimilarByDocument(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 3: Similar to text description");
  console.log("=".repeat(60));

  const userDescription = "comfortable wireless audio for running";
  console.log(`\nUser wants: '${userDescription}'`);

  console.log("\nMatching products:");
  const similar = await db
    .select({
      id: mockItems.id,
      description: mockItems.description,
      category: mockItems.category,
    })
    .from(mockItems)
    .where(
      search.moreLikeThisDocument(mockItems.id, {
        description: userDescription,
      }),
    )
    .orderBy(desc(search.score(mockItems.id)))
    .limit(5);

  for (const item of similar) {
    console.log(
      `  ${item.id}: ${item.description.slice(0, 50)}... [${item.category}]`,
    );
  }
}

async function demoTuningParameters(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 4: Tuning MoreLikeThis parameters");
  console.log("=".repeat(60));

  const sourceId = 5;
  const [source] = await db
    .select()
    .from(mockItems)
    .where(eq(mockItems.id, sourceId))
    .limit(1);
  console.log(`\nSource: '${source.description}'`);

  console.log("\nDefault MLT (no tuning):");
  const defaultSimilar = await db
    .select({
      id: mockItems.id,
      description: mockItems.description,
    })
    .from(mockItems)
    .where(
      search.moreLikeThisId(mockItems.id, sourceId, {
        fields: ["description"],
      }),
    )
    .orderBy(desc(search.score(mockItems.id)))
    .limit(3);

  for (const item of defaultSimilar) {
    console.log(`  ${item.id}: ${item.description.slice(0, 50)}...`);
  }

  console.log("\nTuned MLT (min_doc_freq=2, max_query_terms=5):");
  const tunedSimilar = await db
    .select({
      id: mockItems.id,
      description: mockItems.description,
    })
    .from(mockItems)
    .where(
      search.moreLikeThisId(mockItems.id, sourceId, {
        fields: ["description"],
        minDocFrequency: 2,
        maxQueryTerms: 5,
      }),
    )
    .orderBy(desc(search.score(mockItems.id)))
    .limit(3);

  for (const item of tunedSimilar) {
    console.log(`  ${item.id}: ${item.description.slice(0, 50)}...`);
  }
}

async function demoCombinedWithFilters(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 5: MoreLikeThis + ORM filters");
  console.log("=".repeat(60));

  const sourceId = 15;
  const [source] = await db
    .select()
    .from(mockItems)
    .where(eq(mockItems.id, sourceId))
    .limit(1);
  console.log(`\nSource: '${source.description}' (rating: ${source.rating})`);

  console.log("\nSimilar products (in_stock=True, rating >= 4):");
  const results = await db
    .select({
      id: mockItems.id,
      description: mockItems.description,
      rating: mockItems.rating,
      inStock: mockItems.inStock,
    })
    .from(mockItems)
    .where(
      and(
        search.moreLikeThisId(mockItems.id, sourceId, {
          fields: ["description"],
        }),
        eq(mockItems.inStock, true),
        gte(mockItems.rating, 4),
      ),
    )
    .orderBy(desc(search.score(mockItems.id)))
    .limit(5);

  for (const item of results) {
    const stock = item.inStock ? "In Stock" : "Out of Stock";
    console.log(
      `  ${item.id}: ${item.description.slice(0, 40)}... (rating: ${item.rating}, ${stock})`,
    );
  }
}

async function demoMultifieldSimilarity(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 6: Multi-field similarity");
  console.log("=".repeat(60));

  const sourceId = 3;
  const [source] = await db
    .select()
    .from(mockItems)
    .where(eq(mockItems.id, sourceId))
    .limit(1);
  console.log(`\nSource: '${source.description}' [${source.category}]`);

  console.log("\nSimilar by DESCRIPTION only:");
  const descriptionMatches = await db
    .select({
      id: mockItems.id,
      description: mockItems.description,
      category: mockItems.category,
    })
    .from(mockItems)
    .where(
      and(
        search.moreLikeThisId(mockItems.id, sourceId, {
          fields: ["description"],
        }),
        not(eq(mockItems.id, sourceId)),
      ),
    )
    .limit(3);

  for (const item of descriptionMatches) {
    console.log(
      `  ${item.id}: ${item.description.slice(0, 50)}... [${item.category}]`,
    );
  }

  console.log("\nSimilar by DESCRIPTION + CATEGORY (if both indexed):");
  const multifieldMatches = await db
    .select({
      id: mockItems.id,
      description: mockItems.description,
      category: mockItems.category,
    })
    .from(mockItems)
    .where(
      and(
        search.moreLikeThisId(mockItems.id, sourceId, {
          fields: ["description", "category"],
        }),
        not(eq(mockItems.id, sourceId)),
      ),
    )
    .limit(3);

  for (const item of multifieldMatches) {
    console.log(
      `  ${item.id}: ${item.description.slice(0, 50)}... [${item.category}]`,
    );
  }
}

try {
  await runMoreLikeThis();
} finally {
  await closeDb();
}
