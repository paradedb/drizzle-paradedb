import { and, desc, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import postgres from "postgres";

import { indexing, search, tokenizer } from "../src/index.js";

const client = postgres(
  process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/postgres",
  { onnotice: () => undefined },
);
const db = drizzle({ client });

const mockItems = pgTable(
  "mock_items",
  {
    id: integer("id").primaryKey(),
    description: text("description").notNull(),
    category: varchar("category", { length: 255 }).notNull(),
    rating: integer("rating").notNull(),
    inStock: boolean("in_stock").notNull(),
    createdAt: timestamp("created_at").notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    indexing
      .bm25Index("search_idx")
      .on(
        table.id,
        table.description,
        indexing.bm25Field(table.category, tokenizer.literal()),
        table.rating,
        table.inStock,
        table.createdAt,
        table.metadata,
      ),
  ],
);

try {
  console.log("============================================================");
  console.log("drizzle-paradedb Quickstart Example");
  console.log("============================================================");

  await setupMockItems();

  console.log("\n--- Basic Search: 'shoes' ---");
  for (const item of await db
    .select({ description: mockItems.description })
    .from(mockItems)
    .where(search.matchAll(mockItems.description, "shoes"))
    .limit(5)) {
    console.log(`  - ${item.description.slice(0, 60)}...`);
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
      `  - ${item.description.slice(0, 50)}... (score: ${item.score.toFixed(2)})`,
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
      `  - ${item.description.slice(0, 50)}... (score: ${item.score.toFixed(2)})`,
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
    console.log(`  - ${item.snippet}`);
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
      `  - ${item.description.slice(0, 40)}... (rating: ${item.rating})`,
    );
  }

  console.log("\n============================================================");
  console.log("Done!");
} finally {
  await db.execute(sql`DROP INDEX IF EXISTS search_idx`).catch(() => undefined);
  await client.end();
}

async function setupMockItems() {
  await db.execute(sql`
    CALL paradedb.create_bm25_test_table(
      schema_name => 'public',
      table_name => 'mock_items'
    )
  `);
  await db.execute(sql`DROP INDEX IF EXISTS search_idx`);
  await db.execute(sql`
    CREATE INDEX search_idx ON mock_items
    USING bm25 (id, description, ((category)::pdb.literal), rating, in_stock, created_at, metadata)
    WITH (key_field='id')
  `);
}
