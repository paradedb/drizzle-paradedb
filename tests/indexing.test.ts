import { sql, type SQL } from "drizzle-orm";
import {
  getTableConfig,
  integer,
  jsonb,
  pgTable,
  PgDialect,
  text,
} from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { bm25Field, bm25Index, jsonText, pdbAlias } from "../src/indexing.js";
import { tokenizer } from "../src/index.js";

const products = pgTable(
  "products",
  {
    id: integer("id").primaryKey(),
    description: text("description"),
    metadata: jsonb("metadata"),
    rating: integer("rating"),
  },
  (table) => [
    bm25Index("products_bm25_idx")
      .on(
        table.id,
        bm25Field(
          table.description,
          tokenizer.ngram(3, 3, { positions: true }),
        ),
        bm25Field(
          jsonText(table.metadata, "color"),
          tokenizer.literal({ alias: "metadata_color" }),
        ),
        pdbAlias(sql`${table.rating} + 1`, "next_rating"),
      )
      .where(sql`${table.rating} > 0`),
  ],
);

const dialect = new PgDialect();

describe("ParadeDB indexing helpers", () => {
  it("build normal Drizzle bm25 indexes", () => {
    const [idx] = getTableConfig(products).indexes;

    expect(idx.config.name).toBe("products_bm25_idx");
    expect(idx.config.method).toBe("bm25");
    expect(idx.config.with).toEqual({ key_field: "id" });
    expect(idx.config.where).toBeDefined();
    expect(idx.config.columns).toHaveLength(4);
  });

  it("renders tokenizer casts for index expressions", () => {
    expect(
      render(
        bm25Field(
          products.description,
          tokenizer.ngram(3, 3, { positions: true }),
        ),
      ),
    ).toBe("((\"description\")::pdb.ngram(3,3,'positions=true'))");
    expect(
      render(
        bm25Field(
          jsonText(products.metadata, "color"),
          tokenizer.literal({ alias: "metadata_color" }),
        ),
      ),
    ).toBe("((\"metadata\" ->> 'color')::pdb.literal('alias=metadata_color'))");
    expect(render(pdbAlias(sql`${products.rating} + 1`, "next_rating"))).toBe(
      "((\"rating\" + 1)::pdb.alias('next_rating'))",
    );
  });
});

function render(value: SQL): string {
  return dialect.sqlToQuery(value, "indexes").sql;
}
