import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { Tokenizer, renderTokenizer } from "./tokenizer.js";

type SearchValue = string | string[] | SQLWrapper;
type ProximityValue = string | ProximityExpr;
type SnippetOptions = {
  startTag?: string;
  endTag?: string;
  maxNumChars?: number;
};
type SnippetsOptions = SnippetOptions & {
  limit?: number;
  offset?: number;
  sortBy?: "score" | "position";
};

export function boost(value: SearchValue, factor: number): SQL {
  return sql`${renderSearchValue(value)}::pdb.boost(${sql.raw(String(factor))})`;
}

export function constant(value: SearchValue, score: number): SQL {
  return sql`${renderSearchValue(value)}::pdb.const(${sql.raw(String(score))})`;
}

export function slop(value: SearchValue, n: number): SQL {
  return sql`${renderSearchValue(value)}::pdb.slop(${sql.raw(String(n))})`;
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

export function snippet(
  column: SQLWrapper,
  options?: SnippetOptions,
): SQL<string> {
  return sql<string>`pdb.snippet(${column}${renderSnippetOptions(options)})`;
}

export function snippets(
  column: SQLWrapper,
  options?: SnippetsOptions,
): SQL<string[]> {
  return sql<string[]>`pdb.snippets(${column}${renderSnippetOptions(options)})`;
}

export function snippetPositions(column: SQLWrapper): SQL<[number, number][]> {
  return sql<[number, number][]>`pdb.snippet_positions(${column})`;
}

export function matchAll(column: SQLWrapper, value: SearchValue): SQL<boolean> {
  return sql<boolean>`${column} &&& ${renderSearchValue(value)}`;
}

export function matchAny(column: SQLWrapper, value: SearchValue): SQL<boolean> {
  return sql<boolean>`${column} ||| ${renderSearchValue(value)}`;
}

export function phrase(column: SQLWrapper, value: SearchValue): SQL<boolean> {
  return sql<boolean>`${column} ### ${renderSearchValue(value)}`;
}

export function term(column: SQLWrapper, value: SearchValue): SQL<boolean> {
  return sql<boolean>`${column} === ${renderSearchValue(value)}`;
}

export class ProximityExpr implements SQLWrapper {
  constructor(private expr: SQL) {}

  getSQL(): SQL {
    return this.expr;
  }

  shouldOmitSQLParens(): boolean {
    return true;
  }

  within(
    distance: number,
    other: ProximityValue,
    ordered = false,
  ): ProximityExpr {
    const op = sql.raw(ordered ? "##>" : "##");
    return new ProximityExpr(
      sql`((${this.expr} ${op} ${distance}::int4) ${op} ${other})`,
    );
  }
}

export function proxStr(value: string): ProximityExpr {
  return new ProximityExpr(sql`${value}`);
}

export function proxRegex(
  pattern: string,
  maxExpansions?: number,
): ProximityExpr {
  return new ProximityExpr(
    maxExpansions === undefined
      ? sql`pdb.prox_regex(${pattern})`
      : sql`pdb.prox_regex(${pattern}, ${maxExpansions}::int4)`,
  );
}

export function proxArray(...values: ProximityValue[]): ProximityExpr {
  return new ProximityExpr(sql`pdb.prox_array(${sql.join(values, sql`, `)})`);
}

export function proximity(
  column: SQLWrapper,
  value: ProximityValue,
): SQL<boolean> {
  return sql<boolean>`${column} @@@ ${value}`;
}

function renderSearchValue(value: SearchValue): SQL {
  return Array.isArray(value)
    ? sql`ARRAY[${sql.join(value, sql`, `)}]`
    : sql`${value}`;
}

function renderSnippetOptions(options: SnippetsOptions = {}): SQL {
  const args: SQL[] = [];

  if (options.startTag !== undefined)
    args.push(sql`start_tag => ${options.startTag}`);
  if (options.endTag !== undefined)
    args.push(sql`end_tag => ${options.endTag}`);
  if (options.maxNumChars !== undefined)
    args.push(sql`max_num_chars => ${options.maxNumChars}`);
  if (options.limit !== undefined) args.push(sql`"limit" => ${options.limit}`);
  if (options.offset !== undefined)
    args.push(sql`"offset" => ${options.offset}`);
  if (options.sortBy !== undefined)
    args.push(sql`sort_by => ${options.sortBy}`);

  return args.length ? sql`, ${sql.join(args, sql`, `)}` : sql``;
}
