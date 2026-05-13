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
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& ARRAY[$1, $2]`,
    );
    expect(generated.params).toStrictEqual(["running", "shoes"]);

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
        search.matchAll(
          mockItems.description,
          search.boost("running shoes", 1.5),
        ),
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
        search.matchAll(
          mockItems.description,
          search.constant("running shoes", 1.5),
        ),
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
        search.matchAll(
          mockItems.description,
          search.tokenize("running shoes", tokenizer.simple()),
        ),
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
        search.matchAll(
          mockItems.description,
          search.constant(
            search.tokenize("running shoes", tokenizer.simple()),
            1.5,
          ),
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& $1::pdb.simple::pdb.const(1.5)`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs matchAll with fuzzy", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.matchAll(mockItems.description, search.fuzzy("shose", 1, true)),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" &&& $1::pdb.fuzzy(1, t)`,
    );
    expect(generated.params).toStrictEqual(["shose"]);

    await query;
  });
  it("runs basic matchAny", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.matchAny(mockItems.description, "shose"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" ||| $1`,
    );
    expect(generated.params).toStrictEqual(["shose"]);

    await query;
  });
  it("runs snippet", async () => {
    const query = db
      .select({
        id: mockItems.id,
        snippet: search.snippet(mockItems.description),
      })
      .from(mockItems)
      .where(search.matchAny(mockItems.description, "shoes"))
      .limit(5);

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", pdb.snippet("description") from "mock_items" where "mock_items"."description" ||| $1 limit $2`,
    );
    expect(generated.params).toStrictEqual(["shoes", 5]);

    await query;
  });
  it("runs snippet with options", async () => {
    const query = db
      .select({
        id: mockItems.id,
        snippet: search.snippet(mockItems.description, {
          startTag: "<i>",
          endTag: "</i>",
          maxNumChars: 15,
        }),
      })
      .from(mockItems)
      .where(search.matchAny(mockItems.description, "shoes"))
      .limit(5);

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", pdb.snippet("description", start_tag => $1, end_tag => $2, max_num_chars => $3) from "mock_items" where "mock_items"."description" ||| $4 limit $5`,
    );
    expect(generated.params).toStrictEqual(["<i>", "</i>", 15, "shoes", 5]);

    await query;
  });
  it("runs snippets", async () => {
    const query = db
      .select({
        id: mockItems.id,
        snippets: search.snippets(mockItems.description, {
          startTag: "<b>",
          endTag: "</b>",
          maxNumChars: 15,
          limit: 1,
          offset: 1,
          sortBy: "position",
        }),
      })
      .from(mockItems)
      .where(search.matchAny(mockItems.description, "running"))
      .limit(5);

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", pdb.snippets("description", start_tag => $1, end_tag => $2, max_num_chars => $3, "limit" => $4, "offset" => $5, sort_by => $6) from "mock_items" where "mock_items"."description" ||| $7 limit $8`,
    );
    expect(generated.params).toStrictEqual([
      "<b>",
      "</b>",
      15,
      1,
      1,
      "position",
      "running",
      5,
    ]);

    await query;
  });
  it("runs snippet positions", async () => {
    const query = db
      .select({
        id: mockItems.id,
        snippetPositions: search.snippetPositions(mockItems.description),
      })
      .from(mockItems)
      .where(search.matchAny(mockItems.description, "shoes"))
      .limit(5);

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", pdb.snippet_positions("description") from "mock_items" where "mock_items"."description" ||| $1 limit $2`,
    );
    expect(generated.params).toStrictEqual(["shoes", 5]);

    await query;
  });
  it("runs basic phrase", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.phrase(mockItems.description, "running shoes"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" ### $1`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs phrase with slop", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.phrase(mockItems.description, search.slop("running shoes", 2)),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" ### $1::pdb.slop(2)`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs phrase with slop and tokenizer", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.phrase(
          mockItems.description,
          search.slop(search.tokenize("running shoes", tokenizer.simple()), 2),
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" ### $1::pdb.simple::pdb.slop(2)`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs basic proximity", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.proximity(
          mockItems.description,
          search.proxStr("sleek").within(1, "shoes"),
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ (($1 ## $2::int4) ## $3)`,
    );
    expect(generated.params).toStrictEqual(["sleek", 1, "shoes"]);

    await query;
  });
  it("runs ordered proximity", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.proximity(
          mockItems.description,
          search.proxStr("sleek").within(1, "shoes", true),
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ (($1 ##> $2::int4) ##> $3)`,
    );
    expect(generated.params).toStrictEqual(["sleek", 1, "shoes"]);

    await query;
  });
  it("runs proximity with regex", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.proximity(
          mockItems.description,
          search.proxRegex("sl.*", 100).within(1, "shoes"),
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ ((pdb.prox_regex($1, $2::int4) ## $3::int4) ## $4)`,
    );
    expect(generated.params).toStrictEqual(["sl.*", 100, 1, "shoes"]);

    await query;
  });
  it("runs proximity with array", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.proximity(
          mockItems.description,
          search
            .proxArray(search.proxRegex("sl.*"), "white")
            .within(1, "shoes"),
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ ((pdb.prox_array(pdb.prox_regex($1), $2) ## $3::int4) ## $4)`,
    );
    expect(generated.params).toStrictEqual(["sl.*", "white", 1, "shoes"]);

    await query;
  });
  it("runs chained proximity", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.proximity(
          mockItems.description,
          search
            .proxStr("sleek")
            .within(1, "running")
            .within(2, search.proxArray("sneakers", search.proxRegex("sho.*"))),
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ (((($1 ## $2::int4) ## $3) ## $4::int4) ## pdb.prox_array($5, pdb.prox_regex($6)))`,
    );
    expect(generated.params).toStrictEqual([
      "sleek",
      1,
      "running",
      2,
      "sneakers",
      "sho.*",
    ]);

    await query;
  });
  it("runs right associative proximity", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.proximity(
          mockItems.description,
          search
            .proxStr("sleek")
            .within(1, search.proxStr("running").within(1, "shoes")),
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ (($1 ## $2::int4) ## (($3 ## $4::int4) ## $5))`,
    );
    expect(generated.params).toStrictEqual(["sleek", 1, "running", 1, "shoes"]);

    await query;
  });
  it("runs basic term", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.term(mockItems.description, "running shoes"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" === $1`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);

    await query;
  });
  it("runs term with array", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.term(mockItems.description, ["running", "shoes"]));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" === ARRAY[$1, $2]`,
    );
    expect(generated.params).toStrictEqual(["running", "shoes"]);

    await query;
  });
});
