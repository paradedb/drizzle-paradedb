import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import {
  generateDrizzleJson,
  generateMigration,
} from "drizzle-kit/api-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { tokenizer, search, indexing } from "../src/index.js";
import { client, db } from "./db.js";

const products = pgTable(
  "indexing_test_products",
  {
    id: integer("id").primaryKey(),
    description: text("description"),
    metadata: jsonb("metadata"),
    rating: integer("rating"),
  },
  (table) => [
    indexing
      .bm25Index("indexing_test_products_bm25_idx")
      .on(
        table.id,
        indexing.bm25Field(
          table.description,
          tokenizer.ngram(3, 3, { positions: true }),
        ),
        indexing.bm25Field(
          indexing.jsonText(table.metadata, "color"),
          tokenizer.literal({ alias: "metadata_color" }),
        ),
        search.alias(sql`${table.rating} + 1`, "next_rating"),
      )
      .where(sql`${table.rating} > 0`),
  ],
);

afterAll(async () => {
  await client.end();
});

describe("ParadeDB indexing helpers", () => {
  it("generates and runs bm25 index SQL", async () => {
    const prev = await generateDrizzleJson({});
    const cur = await generateDrizzleJson({ products });
    const statements = await generateMigration(prev, cur);

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_bm25_idx" ON "indexing_test_products" USING bm25 ("id",(("description")::pdb.ngram(3,3,'positions=true')),(("metadata" ->> 'color')::pdb.literal('alias=metadata_color')),(("rating" + 1)::pdb.alias('next_rating'))) WITH (key_field=id) WHERE "rating" > 0;`,
    );

    await db.execute(sql.raw(`DROP TABLE IF EXISTS indexing_test_products`));

    try {
      for (const statement of statements) {
        await db.execute(sql.raw(statement));
      }
    } finally {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS indexing_test_products`));
    }
  });
});
