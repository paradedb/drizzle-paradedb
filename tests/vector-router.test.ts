import { sql } from "drizzle-orm";
import { integer, pgTable } from "drizzle-orm/pg-core";
import {
  generateDrizzleJson,
  generateMigration,
} from "drizzle-kit/api-postgres";
import { afterAll, expect, it } from "vitest";
import { indexing } from "../src/index.js";
import { client, db } from "./db.js";

afterAll(async () => {
  await client.end();
});

it.each(["graph", "ivf"] as const)(
  "preserves %s router in generated migrations",
  async (router) => {
    const items = pgTable(
      "router_items",
      {
        id: integer("id"),
        embedding: indexing.vector("embedding", { dimensions: 64 }),
      },
      (table) => [
        indexing
          .paradedbIndex("router_idx", { vectorRouter: router })
          .on(table.id, indexing.vectorField(table.embedding)),
      ],
    );
    const statements = await generateMigration(
      await generateDrizzleJson({}),
      await generateDrizzleJson({ items }),
    );
    try {
      for (const statement of statements) await db.execute(sql.raw(statement));
      const options = await db.execute(
        sql`SELECT reloptions FROM pg_class WHERE oid = 'router_idx'::regclass`,
      );
      expect(options[0].reloptions).toContain(`vector_router=${router}`);
    } finally {
      await db.execute(sql`DROP TABLE IF EXISTS router_items CASCADE`);
    }
  },
);

it("omits the router by default and rejects unsupported routers", async () => {
  const items = pgTable("router_items", { id: integer("id") }, (table) => [
    indexing.paradedbIndex("router_idx").on(table.id),
  ]);
  const statements = await generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson({ items }),
  );
  expect(statements.join("\n")).not.toContain("vector_router");
  expect(() =>
    indexing
      .paradedbIndex("bad_idx", {
        vectorRouter: "invalid" as "ivf",
      })
      .on(items.id),
  ).toThrow(/vectorRouter/);
});
