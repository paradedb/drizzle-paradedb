import { sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  generateDrizzleJson,
  generateMigration,
} from "drizzle-kit/api-postgres";
import { indexing, tokenizer } from "../../src/index.js";
import { db } from "../db.js";

export function apiParameterFixture(tableName: string, indexName: string) {
  const items = pgTable(
    tableName,
    { id: integer("id"), description: text("description") },
    (table) => [
      indexing
        .paradedbIndex(indexName, {
          searchTokenizer: tokenizer.simple({ lowercase: true }),
          layerSizes: "0",
          backgroundLayerSizes: "100MB, 1GB",
          mutableSegmentRows: 0,
        })
        .on(table.id, table.description),
    ],
  );

  return {
    items,
    setup: async () => {
      const statements = await generateMigration(
        await generateDrizzleJson({}),
        await generateDrizzleJson({ items }),
      );
      for (const statement of statements) await db.execute(sql.raw(statement));
      await db.execute(
        sql`INSERT INTO ${items} VALUES (1, 'red shoes'), (2, 'red boots'), (3, 'blue shoes')`,
      );
    },
    cleanup: async () => {
      await db.execute(sql`DROP TABLE ${items}`);
    },
  };
}
