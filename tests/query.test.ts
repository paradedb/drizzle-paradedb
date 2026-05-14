import { and, desc, sql } from "drizzle-orm";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { search, tokenizer } from "../src/index.js";
import { client, db } from "./db.js";
import { mockItems } from "./mock-items.js";
import {
  MoreLikeThisDocumentOptions,
  MoreLikeThisOptions,
} from "../src/search.js";

const mockItemsWithSerialId = pgTable("mock_items", {
  id: serial("id").primaryKey(),
  description: text("description"),
});

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
  it("renders matchAny against an aliased field", () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.matchAny(
          search.alias(mockItems.description, "description_simple"),
          "running shoes",
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where (("mock_items"."description")::pdb.alias('description_simple')) ||| $1`,
    );
    expect(generated.params).toStrictEqual(["running shoes"]);
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
  it("runs phrase prefix", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.phrasePrefix(mockItems.description, ["running", "sh"]));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ pdb.phrase_prefix(ARRAY[$1, $2])`,
    );
    expect(generated.params).toStrictEqual(["running", "sh"]);

    await query;
  });
  it("runs phrase prefix with max expansions", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.phrasePrefix(mockItems.description, ["running", "sh"], 3));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ pdb.phrase_prefix(ARRAY[$1, $2], $3)`,
    );
    expect(generated.params).toStrictEqual(["running", "sh", 3]);

    await query;
  });
  it("runs regex phrase", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.regexPhrase(mockItems.description, ["ru.*", "shoes"]));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ pdb.regex_phrase(ARRAY[$1, $2])`,
    );
    expect(generated.params).toStrictEqual(["ru.*", "shoes"]);

    await query;
  });
  it("runs regex phrase with options", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.regexPhrase(mockItems.description, ["ru.*", "shoes"], {
          slop: 1,
          maxExpansions: 100,
        }),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ pdb.regex_phrase(ARRAY[$1, $2], slop => $3, max_expansions => $4)`,
    );
    expect(generated.params).toStrictEqual(["ru.*", "shoes", 1, 100]);

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
  it("runs regex", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.regex(mockItems.description, "ru.*"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ pdb.regex($1)`,
    );
    expect(generated.params).toStrictEqual(["ru.*"]);

    await query;
  });
  it("runs regex with boost", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.boost(search.regex(mockItems.description, "ru.*"), 2));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ pdb.regex($1)::pdb.boost(2)`,
    );
    expect(generated.params).toStrictEqual(["ru.*"]);

    await query;
  });
  it("runs range term", async () => {
    const query = db
      .select({
        id: mockItems.id,
        weightRange: mockItems.weightRange,
      })
      .from(mockItems)
      .where(search.rangeTerm(mockItems.weightRange, 1));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "weight_range" from "mock_items" where "mock_items"."weight_range" @@@ pdb.range_term($1::int4)`,
    );
    expect(generated.params).toStrictEqual([1]);

    await query;
  });
  it("runs range term with relation", async () => {
    const query = db
      .select({
        id: mockItems.id,
        weightRange: mockItems.weightRange,
      })
      .from(mockItems)
      .where(search.rangeTerm(mockItems.weightRange, "(10, 12]", "Intersects"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "weight_range" from "mock_items" where "mock_items"."weight_range" @@@ pdb.range_term($1::int4range, $2)`,
    );
    expect(generated.params).toStrictEqual(["(10, 12]", "Intersects"]);

    await query;
  });
  it("runs query with pdb.all()", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.all(mockItems.description));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."description" @@@ pdb.all()`,
    );
    expect(generated.params).toStrictEqual([]);

    await query;
  });
  it("runs value_count agg", async () => {
    const query = db
      .select({
        agg: search.agg({ value_count: { field: "id" } }),
      })
      .from(mockItems)
      .where(search.term(mockItems.category, "electronics"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select pdb.agg($1) from "mock_items" where "mock_items"."category" === $2`,
    );
    expect(generated.params).toStrictEqual([
      `{"value_count":{"field":"id"}}`,
      "electronics",
    ]);

    await query;
  });
  it("runs approximate agg", async () => {
    const query = db
      .select({
        agg: search.agg({ value_count: { field: "id" } }, false),
      })
      .from(mockItems)
      .where(search.matchAny(mockItems.description, "running shoes"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select pdb.agg($1, $2) from "mock_items" where "mock_items"."description" ||| $3`,
    );
    expect(generated.params).toStrictEqual([
      `{"value_count":{"field":"id"}}`,
      false,
      "running shoes",
    ]);

    await query;
  });
  it("runs multiple aggs", async () => {
    const query = db
      .select({
        avgRating: search.agg({ avg: { field: "rating" } }),
        count: search.agg({ value_count: { field: "id" } }),
      })
      .from(mockItems)
      .where(search.term(mockItems.category, "electronics"));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select pdb.agg($1), pdb.agg($2) from "mock_items" where "mock_items"."category" === $3`,
    );
    expect(generated.params).toStrictEqual([
      `{"avg":{"field":"rating"}}`,
      `{"value_count":{"field":"id"}}`,
      "electronics",
    ]);

    await query;
  });
  it("runs value_count agg as a window function", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
        rating: mockItems.rating,
        agg: search.agg({ value_count: { field: "id" } }).over(),
      })
      .from(mockItems)
      .where(
        and(
          search.all(mockItems.id),
          search.term(mockItems.category, "electronics"),
        ),
      )
      .orderBy(desc(mockItems.rating))
      .limit(3);

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description", "rating", pdb.agg('{"value_count":{"field":"id"}}') OVER () from "mock_items" where (("mock_items"."id" @@@ pdb.all()) and ("mock_items"."category" === $1)) order by "mock_items"."rating" desc limit $2`,
    );
    expect(generated.params).toStrictEqual(["electronics", 3]);

    await query;
  });
  it("runs range agg", async () => {
    const query = db
      .select({
        agg: search.agg({
          range: {
            field: "rating",
            ranges: [{ to: 3.0 }, { from: 3.0, to: 6.0 }],
          },
        }),
      })
      .from(mockItems)
      .where(search.all(mockItems.id));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select pdb.agg($1) from "mock_items" where "mock_items"."id" @@@ pdb.all()`,
    );
    expect(generated.params).toStrictEqual([
      `{"range":{"field":"rating","ranges":[{"to":3},{"from":3,"to":6}]}}`,
    ]);

    await query;
  });
  it("runs parse", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.parse(mockItems.id, "description:(sleek shoes) AND rating:>3"),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."id" @@@ pdb.parse($1)`,
    );
    expect(generated.params).toStrictEqual([
      "description:(sleek shoes) AND rating:>3",
    ]);

    await query;
  });
  it("runs parse with options", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.parse(mockItems.id, "description:(sleek shoes)", {
          lenient: true,
          conjunctionMode: true,
        }),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."id" @@@ pdb.parse($1, lenient => $2, conjunction_mode => $3)`,
    );
    expect(generated.params).toStrictEqual([
      "description:(sleek shoes)",
      true,
      true,
    ]);

    await query;
  });
  it("runs more_like_this with document", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.moreLikeThisDocument(mockItems.id, {
          description: "Sleek running shoes",
          category: "footwear",
        }),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."id" @@@ pdb.more_like_this(document => $1)`,
    );
    expect(generated.params).toStrictEqual([
      `{"description":"Sleek running shoes","category":"footwear"}`,
    ]);

    await query;
  });
  it("runs basic more_like_this with id", async () => {
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.moreLikeThisId(mockItems.id, 12));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."id" @@@ pdb.more_like_this(key_value => $1::integer)`,
    );
    expect(generated.params).toStrictEqual([12]);

    await query;
  });
  it("runs more_like_this with a serial id column", async () => {
    const query = db
      .select({
        id: mockItemsWithSerialId.id,
        description: mockItemsWithSerialId.description,
      })
      .from(mockItemsWithSerialId)
      .where(search.moreLikeThisId(mockItemsWithSerialId.id, 12));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."id" @@@ pdb.more_like_this(key_value => $1::integer)`,
    );
    expect(generated.params).toStrictEqual([12]);

    await query;
  });
  it("runs more_like_this document with options", async () => {
    const options: MoreLikeThisDocumentOptions = {
      minTermFrequency: 2,
      minDocFrequency: 1,
      maxDocFrequency: 100,
      maxQueryTerms: 1000,
      minWordLength: 10,
      maxWordLength: 1000,
      stopwords: ["the", "a"],
    };
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(
        search.moreLikeThisDocument(
          mockItems.id,
          {
            description: "Sleek running shoes",
            category: "footwear",
          },
          options,
        ),
      );

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."id" @@@ pdb.more_like_this(document => $1, min_term_frequency => $2, min_doc_frequency => $3, max_doc_frequency => $4, max_query_terms => $5, min_word_length => $6, max_word_length => $7, stopwords => ARRAY[$8, $9])`,
    );
    expect(generated.params).toStrictEqual([
      `{"description":"Sleek running shoes","category":"footwear"}`,
      2,
      1,
      100,
      1000,
      10,
      1000,
      "the",
      "a",
    ]);

    await query;
  });
  it("runs more_like_this id with options", async () => {
    const options: MoreLikeThisOptions = {
      fields: ["description", "category"],
      minTermFrequency: 2,
      minDocFrequency: 1,
      maxDocFrequency: 100,
      maxQueryTerms: 1000,
      minWordLength: 10,
      maxWordLength: 1000,
      stopwords: ["the", "a"],
    };
    const query = db
      .select({
        id: mockItems.id,
        description: mockItems.description,
      })
      .from(mockItems)
      .where(search.moreLikeThisId(mockItems.id, 12, options));

    const generated = query.toSQL();

    expect(generated.sql).toBe(
      `select "id", "description" from "mock_items" where "mock_items"."id" @@@ pdb.more_like_this(key_value => $1::integer, fields => ARRAY[$2, $3], min_term_frequency => $4, min_doc_frequency => $5, max_doc_frequency => $6, max_query_terms => $7, min_word_length => $8, max_word_length => $9, stopwords => ARRAY[$10, $11])`,
    );
    expect(generated.params).toStrictEqual([
      12,
      "description",
      "category",
      2,
      1,
      100,
      1000,
      10,
      1000,
      "the",
      "a",
    ]);

    await query;
  });
  it.each([
    [
      tokenizer.unicodeWords({ remove_emojis: true }),
      "::pdb.unicode_words('remove_emojis=true')",
    ],
    [
      tokenizer.simple({ stemmer: "english", alias: "simple_description" }),
      "::pdb.simple('stemmer=english','alias=simple_description')",
    ],
    [tokenizer.icu(), "::pdb.icu"],
    [tokenizer.chineseCompatible(), "::pdb.chinese_compatible"],
    [tokenizer.jieba(), "::pdb.jieba"],
    [
      tokenizer.lindera("chinese", { keep_whitespace: true }),
      "::pdb.lindera('chinese','keep_whitespace=true')",
    ],
    [tokenizer.literal(), "::pdb.literal"],
    [
      tokenizer.literalNormalized({ trim: true }),
      "::pdb.literal_normalized('trim=true')",
    ],
    [
      tokenizer.ngram(3, 3, { positions: true, prefix_only: true }),
      "::pdb.ngram(3,3,'positions=true','prefix_only=true')",
    ],
    [
      tokenizer.edgeNgram(2, 5, { token_chars: "letter,digit,punctuation" }),
      "::pdb.edge_ngram(2,5,'token_chars=letter,digit,punctuation')",
    ],
    [tokenizer.regexPattern("[a-z]+"), "::pdb.regex_pattern('[a-z]+')"],
    [tokenizer.sourceCode(), "::pdb.source_code"],
    [tokenizer.whitespace(), "::pdb.whitespace"],
  ])(
    "runs tokenizer variation %#",
    async (tokenizerValue, expectedSqlSnippet) => {
      const query = db
        .select({
          id: mockItems.id,
          description: mockItems.description,
        })
        .from(mockItems)
        .where(
          search.matchAll(
            mockItems.description,
            search.tokenize("running shoes", tokenizerValue),
          ),
        );

      const generated = query.toSQL();

      expect(generated.sql).toBe(
        `select "id", "description" from "mock_items" where "mock_items"."description" &&& $1${expectedSqlSnippet}`,
      );
      expect(generated.params).toStrictEqual(["running shoes"]);

      await query;
    },
  );
});
