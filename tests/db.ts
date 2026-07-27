import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/postgres";

export const client = postgres(connectionString);
export const db = drizzle({ client });

export async function supportsVectorSearch(): Promise<boolean> {
  const [row] = await client`
    SELECT count(*)::int AS count
    FROM pg_opclass oc
    JOIN pg_am am ON am.oid = oc.opcmethod
    WHERE am.amname = 'paradedb' AND oc.opcname = 'vector_l2_ops'
  `;
  return row.count > 0;
}
