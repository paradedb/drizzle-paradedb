import { sql } from "drizzle-orm";
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

import { indexing, tokenizer } from "../src/index.js";

export const client = postgres(
  process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/postgres",
  { onnotice: () => undefined },
);
export const db = drizzle({ client });

export const mockItems = pgTable(
  "mock_items",
  {
    id: integer("id").primaryKey(),
    description: text("description").notNull(),
    category: varchar("category", { length: 255 }).notNull(),
    rating: integer("rating").notNull(),
    inStock: boolean("in_stock").notNull(),
    createdAt: timestamp("created_at").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    embedding: indexing.vector("embedding", { dimensions: 8 }),
  },
  (table) => [
    indexing
      .paradedbIndex("search_idx")
      .on(
        table.id,
        table.description,
        indexing.paradedbField(table.category, tokenizer.literal()),
        table.rating,
        table.inStock,
        table.createdAt,
        table.metadata,
        indexing.vectorField(table.embedding, "cosine"),
      ),
  ],
);

export const autocompleteItems = pgTable(
  "autocomplete_items",
  {
    id: integer("id").primaryKey(),
    description: text("description").notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    rating: integer("rating").notNull(),
    inStock: boolean("in_stock").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    indexing
      .paradedbIndex("search_idx")
      .on(
        table.id,
        table.description,
        indexing.paradedbField(
          table.description,
          tokenizer.ngram(3, 8, { alias: "description_ngram" }),
        ),
        indexing.paradedbField(table.category, tokenizer.literal()),
      ),
  ],
);

export async function setupMockItems(): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS mock_items CASCADE`);
  await db.execute(sql`
    CALL paradedb.create_bm25_test_table(
      schema_name => 'public',
      table_name => 'mock_items'
    )
  `);
  await db.execute(sql`DROP INDEX IF EXISTS search_idx`);
  await db.execute(sql`
    CREATE INDEX search_idx ON mock_items
    USING paradedb (id, description, ((category)::pdb.literal), rating, in_stock, created_at, metadata, weight_range, last_updated_date, latest_available_time, embedding vector_cosine_ops)
    WITH (key_field='id', json_fields='{"metadata":{"fast":true}}')
  `);
}

export async function setupAutocompleteItems(): Promise<void> {
  await setupMockItems();
  console.log("\nCreating autocomplete_items table...");
  await db.execute(sql`DROP TABLE IF EXISTS autocomplete_items CASCADE`);
  await db.execute(sql`
    CREATE TABLE autocomplete_items (
      id integer PRIMARY KEY,
      description text NOT NULL,
      category varchar(100) NOT NULL,
      rating integer NOT NULL,
      in_stock boolean NOT NULL,
      created_at timestamp NOT NULL
    )
  `);
  await db.execute(sql`
    INSERT INTO autocomplete_items (id, description, category, rating, in_stock, created_at)
    SELECT id, description, category, rating, in_stock, created_at
    FROM mock_items
  `);
  await db.execute(sql`DROP INDEX IF EXISTS search_idx`);
  await db.execute(sql`
    CREATE INDEX search_idx ON autocomplete_items
    USING paradedb (id, description, ((description)::pdb.ngram(3,8,'alias=description_ngram')), ((category)::pdb.literal))
    WITH (key_field='id')
  `);
}

export async function closeDb(): Promise<void> {
  await client.end();
}
