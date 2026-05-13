import { sql } from "drizzle-orm";

import { client, db } from "../src/db.js";

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

const [{ count }] = await db.execute<{ count: string }>(
  sql`SELECT count(*) FROM mock_items`,
);

console.log(`mock_items is ready with ${count} rows`);

await client.end();
