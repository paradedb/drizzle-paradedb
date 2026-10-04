import { sql, desc } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  generateDrizzleJson,
  generateMigration,
} from "drizzle-kit/api-postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { indexing, search, tokenizer } from "../src/index.js";
import { client, db } from "./db.js";

const items = pgTable(
  "api_items",
  { id: integer("id"), description: text("description") },
  (table) => [
    indexing
      .paradedbIndex("api_idx", {
        searchTokenizer: tokenizer.simple({ lowercase: true }),
        layerSizes: "0",
        backgroundLayerSizes: "100MB, 1GB",
        mutableSegmentRows: 0,
      })
      .on(table.id, table.description),
  ],
);
beforeAll(async () => {
  const statements = await generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson({ items }),
  );
  for (const statement of statements) await db.execute(sql.raw(statement));
  await db.execute(
    sql`INSERT INTO api_items VALUES (1, 'red shoes'), (2, 'red boots'), (3, 'blue shoes')`,
  );
});
afterAll(async () => {
  await db.execute(sql`DROP TABLE api_items`);
  await client.end();
});

it("executes nested Boolean and disjunction-max queries with aggregate limits", async () => {
  const conjunction = search.booleanQuery({
    should: ["description:red", "description:shoes"],
    minimumShouldMatch: 2,
  });
  expect(
    await db
      .select({ id: items.id })
      .from(items)
      .where(search.query(items.id, conjunction)),
  ).toEqual([{ id: 1 }]);
  const query = search.booleanQuery({
    must: [
      search.disjunctionMax([conjunction, "description:boots"], {
        tieBreaker: 0.5,
      }),
    ],
    mustNot: ["description:blue"],
  });
  expect(
    (
      await db
        .select({ id: items.id })
        .from(items)
        .where(search.query(items.id, query))
        .orderBy(items.id)
    ).map((row) => row.id),
  ).toEqual([1, 2]);
  const result = await db.execute(
    sql`SELECT ${search.aggregate("api_idx", query, { count: { value_count: { field: "id" } } }, { memoryLimit: 10000000, bucketLimit: 100, visibility: "transaction" })} AS result`,
  );
  expect(result[0].result).toEqual({ count: { value: 2 } });
  await expect(
    db.execute(
      sql`SELECT ${search.aggregate("api_idx", "description:red", { ids: { terms: { field: "id", size: 10 } } }, { memoryLimit: 10000000, bucketLimit: 1 })}`,
    ),
  ).rejects.toThrow();
  const scores = async (tie: number) =>
    db
      .select({ id: items.id, score: search.score(items.id) })
      .from(items)
      .where(
        search.query(
          items.id,
          search.disjunctionMax(["description:red", "description:shoes"], {
            tieBreaker: tie,
          }),
        ),
      )
      .orderBy(desc(search.score(items.id)));
  expect(
    (await scores(0.5)).find((row) => row.id === 1)!.score,
  ).toBeGreaterThan((await scores(0)).find((row) => row.id === 1)!.score);
  expect(
    await db
      .select({ id: items.id })
      .from(items)
      .where(search.query(items.id, 'description:"O\'Reilly"')),
  ).toEqual([]);
});

it("supports sparse snippet options and snippet position pagination", async () => {
  const rows = await db
    .select({
      id: items.id,
      snippet: search.snippet(items.description, {
        maxNumChars: 20,
        limit: 1,
        offset: 0,
      }),
      positions: search.snippetPositions(items.description, {
        limit: 1,
        offset: 1,
      }),
    })
    .from(items)
    .where(search.query(items.id, "description:shoes"))
    .orderBy(items.id);
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.snippet.includes("<b>"))).toBe(true);
  const native = await db.execute(
    sql`SELECT id, pdb.snippet_positions(description, "limit" => 1, "offset" => 1) AS positions FROM api_items WHERE description ||| 'shoes' ORDER BY id`,
  );
  expect(rows.map(({ id, positions }) => ({ id, positions }))).toEqual([
    ...native,
  ]);
  const generated = db
    .select({
      snippet: search.snippet(items.description, { endTag: "</mark>" }),
    })
    .from(items)
    .where(search.query(items.id, "description:red"))
    .toSQL();
  expect(generated.sql).toContain("end_tag =>");
  await db.execute(
    sql`SELECT pdb.snippet(description, end_tag => '</mark>') FROM api_items WHERE description ||| 'red'`,
  );
});

it("persists index options emitted by Drizzle migrations", async () => {
  const result = await db.execute(
    sql`SELECT reloptions FROM pg_class WHERE oid = 'api_idx'::regclass`,
  );
  expect(result[0].reloptions).toEqual(
    expect.arrayContaining([
      "layer_sizes=0",
      "background_layer_sizes=100MB, 1GB",
      "mutable_segment_rows=0",
      "search_tokenizer=simple(lowercase=true)",
    ]),
  );
});

it("rejects invalid query, pagination, index and aggregate options", () => {
  expect(() => search.booleanQuery({ minimumShouldMatch: -1 })).toThrow(
    "minimumShouldMatch",
  );
  expect(() =>
    search.disjunctionMax(["description:shoes"], { tieBreaker: NaN }),
  ).toThrow("tieBreaker");
  expect(() => search.disjunctionMax([])).toThrow("must not be empty");
  expect(() =>
    search.snippetPositions(items.description, { offset: -1 }),
  ).toThrow("offset");
  expect(() => search.aggregate("idx", "*", {}, { memoryLimit: 0 })).toThrow(
    "memoryLimit",
  );
  expect(() =>
    search.aggregate("idx", "*", {}, { solveMvcc: true, visibility: "raw" }),
  ).toThrow("not both");
});
