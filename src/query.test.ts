import { desc, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { client, db } from "./db.js";
import { search, tokenizer } from "./index.js";
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
  it("runs basic matchAll", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.matchAll(mockItems.description, "running shoes"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& $1`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs matchAll with an array", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.matchAll(mockItems.description, ["running", "shoes"]));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& ARRAY['running', 'shoes']`,
    );
    expect(generated.params).toStrictEqual([]);

    await query;
  });
  it("runs matchAll with boost", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.matchAll(mockItems.description, "running shoes", {
          relevance: { kind: "boost", value: 1.5 },
        }),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& $1::pdb.boost(1.5)`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs matchAll with const", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.matchAll(mockItems.description, "running shoes", {
          relevance: { kind: "const", value: 1.5 },
        }),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& $1::pdb.const(1.5)`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs matchAll with tokenizer", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.matchAll(mockItems.description, "running shoes", {
          tokenizer: tokenizer.simple(),
        }),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& $1::pdb.simple`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs matchAll with tokenizer and relevance tuning", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.matchAll(mockItems.description, "running shoes", {
          tokenizer: tokenizer.simple(),
          relevance: { kind: "const", value: 1.5 },
        }),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& $1::pdb.simple::pdb.const(1.5)`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
});
