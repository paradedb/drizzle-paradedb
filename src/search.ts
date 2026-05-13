import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { Tokenizer, renderTokenizer } from "./tokenizer.js";

type SearchValue = string | string[] | SQLWrapper;

export function boost(value: SearchValue, factor: number): SQL {
  return sql`${renderSearchValue(value)}::pdb.boost(${sql.raw(String(factor))})`;
}

export function constant(value: SearchValue, score: number): SQL {
  return sql`${renderSearchValue(value)}::pdb.const(${sql.raw(String(score))})`;
}

export function fuzzy(
  value: SearchValue,
  distance: number,
  prefix?: boolean,
  transpositionCostOne?: boolean,
): SQL {
  const args = [String(distance)];
  if (prefix !== undefined) args.push(prefix ? "t" : "f");
  if (transpositionCostOne !== undefined)
    args.push(transpositionCostOne ? "t" : "f");

  return sql`${renderSearchValue(value)}::pdb.fuzzy(${sql.raw(args.join(", "))})`;
}

export function tokenize(value: SearchValue, tokenizer: Tokenizer): SQL {
  return sql`${renderSearchValue(value)}::${sql.raw(renderTokenizer(tokenizer))}`;
}

export function score(key: SQLWrapper): SQL<number> {
  return sql<number>`pdb.score(${key})`;
}

export function matchAll(column: SQLWrapper, value: SearchValue): SQL {
  return sql`${column} &&& ${renderSearchValue(value)}`;
}

export function matchAny(column: SQLWrapper, value: SearchValue): SQL {
  return sql`${column} ||| ${renderSearchValue(value)}`;
}

function renderSearchValue(value: SearchValue): SQL {
  return Array.isArray(value)
    ? sql`ARRAY[${sql.join(value, sql`, `)}]`
    : sql`${value}`;
}
