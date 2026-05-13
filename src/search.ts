import { sql, type AnyColumn, type SQL, type SQLWrapper } from "drizzle-orm";
import type { TypedQueryBuilder } from "drizzle-orm/query-builders/query-builder";
import { Tokenizer, renderTokenizer } from "./tokenizer.js";

type SearchValue = string | SQLWrapper | TypedQueryBuilder<any>;

export function boost(value: SearchValue, factor: number): SQL {
  return sql`${value}::pdb.boost(${sql.raw(String(factor))})`;
}

export function score(key: SQLWrapper | AnyColumn): SQL<number> {
  return sql<number>`pdb.score(${key})`;
}

export function matchAll(column: SQLWrapper | AnyColumn, value: SearchValue, tokenizer?: Tokenizer): SQL {
  return sql`${column} &&& ${tokenizer ? tokenize(value, tokenizer) : value}`;
}

export function tokenize(value: SearchValue, tokenizer: Tokenizer): SQL {
  return sql`${value}::${sql.raw(renderTokenizer(tokenizer))}`;
}
