import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { TypedQueryBuilder } from "drizzle-orm/query-builders/query-builder";
import { Tokenizer, renderTokenizer } from "./tokenizer.js";

type SearchValue = string | SQLWrapper | TypedQueryBuilder<any>;

type Relevance = { kind: "boost" | "const"; value: number };
export function boost(value: SearchValue, factor: number): SQL {
  return sql`${value}::pdb.boost(${sql.raw(String(factor))})`;
}

export type Options = { tokenizer?: Tokenizer; relevance?: Relevance };

export function score(key: SQLWrapper): SQL<number> {
  return sql<number>`pdb.score(${key})`;
}

export function matchAll(
  column: SQLWrapper,
  value: SearchValue,
  options: Options = {},
): SQL {
  if (options.tokenizer) value = tokenize(value, options.tokenizer);
  if (options.relevance) value = renderRelevance(value, options.relevance);
  return sql`${column} &&& ${value}`;
}

function tokenize(value: SearchValue, tokenizer: Tokenizer): SQL {
  return sql`${value}::${sql.raw(renderTokenizer(tokenizer))}`;
}

function renderRelevance(value: SearchValue, relevance: Relevance): SQL {
  return sql`${value}::pdb.${sql.raw(relevance.kind)}(${sql.raw(String(relevance.value))})`;
}
