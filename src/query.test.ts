import { desc, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { client, db } from "./db.js";
import { search } from "./index.js";
import { mockItems } from "./schema.js";

beforeAll(async () => {
  await db.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('public.mock_items') IS NULL THEN
        CALL paradedb.create_bm25_test_table(
          schema_name => 'public',
          table_name => 'mock_items'
        );
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS search_idx ON mock_items
    USING bm25 (id, description, category, rating, in_stock, created_at, metadata, weight_range)
    WITH (key_field='id');
  `);
});

afterAll(async () => {
  await client.end();
});

describe("ParadeDB query language", () => {
  it("builds and runs a match conjunction query", async () => {
    const query = db
      .select({
        description: mockItems.description,
        rating: mockItems.rating,
        category: mockItems.category,
      })
      .from(mockItems)
      .where(search.matchAll(mockItems.description, "running shoes"))
      .orderBy(desc(search.score(mockItems.id)))
      .limit(5);

    const generated = query.toSQL();

    expect(generated.sql).toBe(`select "description", "rating", "category" from "mock_items" where "mock_items"."description" &&& $1 order by pdb.score("mock_items"."id") desc limit $2`);
    expect(generated.params).toStrictEqual(["running shoes", 5]);

    await query;
  });
});
