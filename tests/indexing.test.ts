import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, varchar } from "drizzle-orm/pg-core";
import {
  generateDrizzleJson,
  generateMigration,
} from "drizzle-kit/api-postgres";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

import { tokenizer, search, indexing, diagnostics } from "../src/index.js";
import { client, db } from "./db.js";

afterAll(async () => {
  await client.end();
});

describe("ParadeDB indexing helpers", () => {
  it("creates partitioned vector indexes and exposes visibility and diagnostics", async () => {
    const items = pgTable(
      "indexing_test_products",
      {
        id: integer("id"),
        rating: integer("rating"),
        description: text("description"),
        embedding: indexing.vector("embedding", { dimensions: 64 }),
      },
      (table) => [
        indexing
          .paradedbIndex("indexing_test_products_idx", {
            vectorRouter: "ivf",
            partitionBy: "rating,id",
            targetSegmentCount: 8,
            vectorFields: { embedding: { quantization: false } },
          })
          .on(
            table.id,
            table.rating,
            indexing.paradedbField(
              table.description,
              tokenizer.simple({ pnorms: true }),
            ),
            indexing.paradedbField(
              table.description,
              tokenizer.jieba({
                alias: "description_jieba",
                search_mode: false,
              }),
            ),
            indexing.paradedbField(
              table.description,
              tokenizer.chineseCompatible({
                alias: "description_chinese",
                chinese_convert: "t2s",
              }),
            ),
            indexing.vectorField(table.embedding),
          ),
      ],
    );
    const statements = await generateMigration(
      await generateDrizzleJson({}),
      await generateDrizzleJson({ items }),
    );
    await db.execute(
      sql.raw("DROP TABLE IF EXISTS indexing_test_products CASCADE"),
    );
    try {
      for (const statement of statements) await db.execute(sql.raw(statement));
      await db.execute(
        sql`INSERT INTO indexing_test_products SELECT i, i % 3, 'partitioned shoes', ARRAY(SELECT sin(i*j)::real FROM generate_series(1,64) j)::vector FROM generate_series(1,2048) i`,
      );
      const options = await db.execute(
        sql`SELECT reloptions FROM pg_class WHERE oid = 'indexing_test_products_idx'::regclass`,
      );
      expect(options[0].reloptions).toContain("partition_by=rating,id");
      expect(options[0].reloptions).toContain("target_segment_count=8");
      const config = await db.execute(
        diagnostics.vectorConfig("indexing_test_products_idx", "embedding"),
      );
      expect(config[0].quantized).toBe(false);
      expect(
        (
          await db.execute(
            diagnostics.vectorInfo("indexing_test_products_idx", "embedding"),
          )
        ).length,
      ).toBeGreaterThan(0);
      await db.execute(
        sql.raw(
          `ALTER INDEX indexing_test_products_idx SET (target_segment_count = 1, max_leaf_size = 16, vector_fields = '{"embedding":{"quantization":true}}')`,
        ),
      );
      await db.execute(sql`REINDEX INDEX indexing_test_products_idx`);
      const quantizedConfig = await db.execute(
        diagnostics.vectorConfig("indexing_test_products_idx", "embedding"),
      );
      expect(quantizedConfig[0].quantized).toBe(true);
      await db.execute(
        diagnostics.vectorEstimatorInfo(
          "indexing_test_products_idx",
          "embedding",
        ),
      );
      await db.execute(
        diagnostics.vectorEstimatorInfo(
          "indexing_test_products_idx",
          "embedding",
          [Array(64).fill(0.1)],
        ),
      );
      for (const visibility of ["transaction", "raw", "threshold"] as const) {
        const result = await db
          .select({
            result: search.agg({ value_count: { field: "id" } }, visibility),
          })
          .from(items);
        expect(result[0].result).toEqual({ value: 2048 });
        const window = await db
          .select({
            result: search
              .agg({ value_count: { field: "id" } }, visibility)
              .over(),
          })
          .from(items)
          .limit(1);
        expect(window[0].result).toEqual({ value: 2048 });
      }
      const count = await db.execute(
        sql`SELECT COUNT(*)::int AS count FROM indexing_test_products WHERE description @@@ 'shoes' AND rating = 1`,
      );
      expect(count[0].count).toBe(683);
    } finally {
      await db.execute(sql`DROP TABLE indexing_test_products`);
    }
  });

  it("generates and runs an index with a tokenized first field", async () => {
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
          .paradedbIndex("indexing_test_products_idx")
          .on(
            indexing.paradedbField(
              table.description,
              tokenizer.ngram(3, 3, { positions: true }),
            ),
            indexing.paradedbField(
              indexing.jsonText(table.metadata, "color"),
              tokenizer.literal({ alias: "metadata_color" }),
            ),
            search.alias(sql`${table.rating} + 1`, "next_rating"),
          )
          .where(sql`${table.rating} > 0`),
      ],
    );

    const prev = await generateDrizzleJson({});
    const cur = await generateDrizzleJson({ products });
    const statements = await generateMigration(prev, cur);

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ((("description")::pdb.ngram(3,3,'positions=true')),(("metadata" ->> 'color')::pdb.literal('alias=metadata_color')),(("rating" + 1)::pdb.alias('next_rating'))) WHERE "rating" > 0;`,
    );

    await runStatements(statements);
  });

  it("generates and runs array, expression, multi-tokenizer, concurrent, and search tokenizer index SQL", async () => {
    const products = pgTable(
      "indexing_test_products",
      {
        id: integer("id").primaryKey(),
        description: text("description"),
        category: text("category"),
        categories: text("categories").array(),
        tags: varchar("tags", { length: 255 }).array(),
      },
      (table) => [
        indexing
          .paradedbIndex("indexing_test_products_idx", {
            searchTokenizer: tokenizer.simple({ lowercase: false }),
          })
          .on(
            table.id,
            table.categories,
            indexing.paradedbField(table.tags, tokenizer.literal()),
            indexing.paradedbField(
              sql`${table.description} || ' ' || ${table.category}`,
              tokenizer.simple({ alias: "description_concat" }),
            ),
            indexing.paradedbField(table.description, tokenizer.literal()),
            indexing.paradedbField(
              table.description,
              tokenizer.simple({ alias: "description_simple" }),
            ),
          )
          .concurrently(),
      ],
    );

    const prev = await generateDrizzleJson({});
    const cur = await generateDrizzleJson({ products });
    const statements = await generateMigration(prev, cur);

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX CONCURRENTLY "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id","categories",(("tags")::pdb.literal),(("description" || ' ' || "category")::pdb.simple('alias=description_concat')),(("description")::pdb.literal),(("description")::pdb.simple('alias=description_simple'))) WITH (search_tokenizer='simple(lowercase=false)');`,
    );

    await runStatements(statements);
  });
  it("generates search tokenizer with no arguments", async () => {
    const products = pgTable(
      "indexing_test_products",
      {
        id: integer("id").primaryKey(),
        description: text("description"),
        category: text("category"),
        categories: text("categories").array(),
        tags: varchar("tags", { length: 255 }).array(),
      },
      (table) => [
        indexing
          .paradedbIndex("indexing_test_products_idx", {
            searchTokenizer: tokenizer.simple(),
          })
          .on(table.id, table.categories),
      ],
    );

    const prev = await generateDrizzleJson({});
    const cur = await generateDrizzleJson({ products });
    const statements = await generateMigration(prev, cur);

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id","categories") WITH (search_tokenizer='simple');`,
    );

    await runStatements(statements);
  });

  it("generates and runs vector field index SQL with opclasses", async () => {
    const statements = await generateVectorIndexStatements();

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id",(("description")::pdb.simple),"embedding" vector_l2_ops,"embedding_cosine" vector_cosine_ops,"embedding_ip" vector_ip_ops);`,
    );

    await runStatements(statements);
  });

  it("generates and runs vector index SQL with all build options", async () => {
    const statements = await generateVectorIndexStatements({
      trainingSampleRatio: 0.01,
      maxLeafSize: 32,
    });

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id",(("description")::pdb.simple),"embedding" vector_l2_ops,"embedding_cosine" vector_cosine_ops,"embedding_ip" vector_ip_ops) WITH (training_sample_ratio=0.01, max_leaf_size=32);`,
    );

    await runStatements(statements);
  });

  it("generates and runs vector index SQL with a single build option", async () => {
    const statements = await generateVectorIndexStatements({
      trainingSampleRatio: 0.5,
    });

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id",(("description")::pdb.simple),"embedding" vector_l2_ops,"embedding_cosine" vector_cosine_ops,"embedding_ip" vector_ip_ops) WITH (training_sample_ratio=0.5);`,
    );

    await runStatements(statements);
  });

  it("applies a paradedb index with drizzle-kit push", async () => {
    const tempDir = await mkdtemp(
      join(dirname(fileURLToPath(import.meta.url)), "drizzle-kit-"),
    );

    await writeFile(
      join(tempDir, "schema.ts"),
      `import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { indexing, tokenizer } from "../../src/index";

export const products = pgTable("drizzle_kit_products", {
  id: integer("id").primaryKey(),
  description: text("description"),
  category: text("category"),
}, (table) => [
  indexing.paradedbIndex("drizzle_kit_products_idx").on(
    table.id,
    indexing.paradedbField(table.description, tokenizer.simple()),
    table.category,
  ),
]);
`,
    );

    await writeFile(
      join(tempDir, "drizzle.config.ts"),
      `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres",
  },
  schemaFilter: "public",
  tablesFilter: "drizzle_kit_products",
});
`,
    );

    await db.execute(sql.raw("DROP TABLE IF EXISTS drizzle_kit_products"));

    try {
      await promisify(execFile)(
        process.execPath,
        [
          join(
            dirname(fileURLToPath(import.meta.url)),
            "..",
            "node_modules",
            "drizzle-kit",
            "bin.cjs",
          ),
          "push",
          "--config",
          "drizzle.config.ts",
          "--force",
        ],
        { cwd: tempDir },
      );

      const indexes = await client`
          SELECT indexdef
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'drizzle_kit_products'
            AND indexname = 'drizzle_kit_products_idx'
        `;

      expect(indexes.map((row) => row.indexdef)).toStrictEqual([
        "CREATE INDEX drizzle_kit_products_idx ON public.drizzle_kit_products USING paradedb (id, ((description)::pdb.simple), category)",
      ]);

      await db.execute(
        sql.raw(`
          INSERT INTO drizzle_kit_products (id, description, category)
          VALUES (1, 'comfortable running shoes', 'footwear')
        `),
      );

      const results = await client`
          SELECT id
          FROM drizzle_kit_products
          WHERE description &&& 'running'
        `;

      expect(results.map((row) => row.id)).toStrictEqual([1]);
    } finally {
      await db.execute(sql.raw("DROP TABLE IF EXISTS drizzle_kit_products"));
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});

async function generateVectorIndexStatements(
  options: indexing.ParadedbIndexOptions = {},
): Promise<string[]> {
  const products = pgTable(
    "indexing_test_products",
    {
      id: integer("id").primaryKey(),
      description: text("description"),
      embedding: indexing.vector("embedding", { dimensions: 3 }),
      embeddingCosine: indexing.vector("embedding_cosine", { dimensions: 3 }),
      embeddingIp: indexing.vector("embedding_ip", { dimensions: 3 }),
    },
    (table) => [
      indexing
        .paradedbIndex("indexing_test_products_idx", options)
        .on(
          table.id,
          indexing.paradedbField(table.description, tokenizer.simple()),
          indexing.vectorField(table.embedding),
          indexing.vectorField(table.embeddingCosine, "cosine"),
          indexing.vectorField(table.embeddingIp, "ip"),
        ),
    ],
  );

  const prev = await generateDrizzleJson({});
  const cur = await generateDrizzleJson({ products });
  return generateMigration(prev, cur);
}

async function runStatements(statements: string[]) {
  await db.execute(sql.raw(`DROP TABLE IF EXISTS indexing_test_products`));

  try {
    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }
  } finally {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS indexing_test_products`));
  }
}
