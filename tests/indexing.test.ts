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

import { tokenizer, search, indexing } from "../src/index.js";
import { client, db } from "./db.js";

afterAll(async () => {
  await client.end();
});

describe("ParadeDB indexing helpers", () => {
  it("generates and runs paradedb index SQL", async () => {
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
            table.id,
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
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id",(("description")::pdb.ngram(3,3,'positions=true')),(("metadata" ->> 'color')::pdb.literal('alias=metadata_color')),(("rating" + 1)::pdb.alias('next_rating'))) WITH (key_field=id) WHERE "rating" > 0;`,
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
      `CREATE INDEX CONCURRENTLY "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id","categories",(("tags")::pdb.literal),(("description" || ' ' || "category")::pdb.simple('alias=description_concat')),(("description")::pdb.literal),(("description")::pdb.simple('alias=description_simple'))) WITH (key_field=id, search_tokenizer='simple(lowercase=false)');`,
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
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id","categories") WITH (key_field=id, search_tokenizer='simple');`,
    );

    await runStatements(statements);
  });

  it("generates and runs vector field index SQL with opclasses", async () => {
    const statements = await generateVectorIndexStatements();

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id",(("description")::pdb.simple),"embedding" vector_l2_ops,"embedding_cosine" vector_cosine_ops,"embedding_ip" vector_ip_ops) WITH (key_field=id);`,
    );

    await runStatements(statements);
  });

  it("generates and runs vector index SQL with all build options", async () => {
    const statements = await generateVectorIndexStatements({
      centroidRatio: 0.01,
      trainingSamplesPerCentroid: 32,
      clusterReplication: 1,
    });

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id",(("description")::pdb.simple),"embedding" vector_l2_ops,"embedding_cosine" vector_cosine_ops,"embedding_ip" vector_ip_ops) WITH (key_field=id, centroid_ratio=0.01, training_samples_per_centroid=32, cluster_replication=1);`,
    );

    await runStatements(statements);
  });

  it("generates and runs vector index SQL with a single build option", async () => {
    const statements = await generateVectorIndexStatements({
      centroidRatio: 0.5,
    });

    expect(statements[1]).toStrictEqual(
      `CREATE INDEX "indexing_test_products_idx" ON "indexing_test_products" USING paradedb ("id",(("description")::pdb.simple),"embedding" vector_l2_ops,"embedding_cosine" vector_cosine_ops,"embedding_ip" vector_ip_ops) WITH (key_field=id, centroid_ratio=0.5);`,
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
        "CREATE INDEX drizzle_kit_products_idx ON public.drizzle_kit_products USING paradedb (id, ((description)::pdb.simple), category) WITH (key_field=id)",
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
