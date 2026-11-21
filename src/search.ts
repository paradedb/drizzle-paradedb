import {
  type AnyColumn,
  Column,
  getColumnTable,
  getTableAsAliasSQL,
  is,
  isSQLWrapper,
  Name,
  Param,
  Placeholder,
  SQL,
  sql,
  type SQLChunk,
  type SQLWrapper,
  StringChunk,
  Subquery,
  Table,
  View,
} from "drizzle-orm";
import { type Tokenizer, renderTokenizer } from "./tokenizer.ts";

export { cosineDistance, innerProduct, l2Distance } from "drizzle-orm";

type SearchValue = string | string[] | SQLWrapper;

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

export function alias(column: SQLWrapper, alias: string): SQL {
  return sql`((${column})::pdb.alias(${sql.raw(quote(alias))}))`;
}

export function score(column: AnyColumn): SQL<number> {
  return sql<number>`pdb.score(${column})`;
}

/** The server can add or rename the other keys of an explanation between releases. */
export type ScoreExplanation = {
  value: number;
  [key: string]: unknown;
};

/** Explain the BM25 score of the row. Pass the same column as to `score`. */
export function explainScore(column: AnyColumn): SQL<ScoreExplanation> {
  return sql<ScoreExplanation>`pdb.explain_score(${column})`;
}

export function exists(column: AnyColumn): SQL<boolean> {
  return sql<boolean>`${column} @@@ pdb.exists()`;
}

export type SnippetOptions = {
  startTag?: string;
  endTag?: string;
  maxNumChars?: number;
};
export type SnippetsOptions = SnippetOptions & {
  limit?: number;
  offset?: number;
  sortBy?: "score" | "position";
};

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

export function snippetPositions(
  column: SQLWrapper,
  options: { limit?: number; offset?: number } = {},
): SQL<[number, number][]> {
  return sql<
    [number, number][]
  >`pdb.snippet_positions(${column}${renderSnippetOptions(options)})`;
}

export function matchAll(column: SQLWrapper, value: SearchValue): SQL<boolean> {
  return sql<boolean>`${column} &&& ${renderSearchValue(value)}`;
}

export function matchAny(column: SQLWrapper, value: SearchValue): SQL<boolean> {
  return sql<boolean>`${column} ||| ${renderSearchValue(value)}`;
}

export type ExpandOptions = {
  where?: SQLWrapper;
};

function literal(value: unknown): SQLChunk {
  // `inlineParams` doubles only the quotes of a string, so a backslash can end
  // the literal when `standard_conforming_strings` is off. An `E''` literal
  // reads the same with both settings.
  if (typeof value === "string" && value.includes("\\"))
    return sql.raw(
      `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`,
    );
  // `inlineParams` writes a `Date` with `toString`, which Postgres can't read.
  if (value instanceof Date) return value.toISOString();
  return value as SQLChunk;
}

function inlineLiterals(chunk: SQLChunk): SQLChunk {
  if (Array.isArray(chunk)) return chunk.map(inlineLiterals);
  if (is(chunk, SQL)) return new SQL(chunk.queryChunks.map(inlineLiterals));
  if (
    is(chunk, Placeholder) ||
    (is(chunk, Param) && is(chunk.value, Placeholder))
  )
    throw new Error("expand does not take a placeholder in `where`");
  if (is(chunk, Param)) {
    if (chunk.value === null) return chunk;
    const value = chunk.encoder.mapToDriverValue(chunk.value);
    if (is(value, SQL)) return inlineLiterals(value);
    const inlined = literal(value);
    return inlined === value ? chunk : inlined;
  }
  // These chunks are names, not values.
  if (
    [StringChunk, Name, Column, Table, View, Subquery].some((kind) =>
      is(chunk, kind),
    )
  )
    return chunk;
  if (isSQLWrapper(chunk)) {
    const inner = inlineLiterals(chunk.getSQL());
    return chunk.shouldOmitSQLParens?.() ? inner : sql`(${inner})`;
  }
  return literal(chunk);
}

/** Expand the search text with the synonym rules in the table of `rule`.
 * Values in `where` go into the SQL as literals, because a parameter there
 * keeps a prepared statement from using the partial synonym index. So a
 * placeholder in `where` is an error.
 */
export function expand(
  text: string | SQLWrapper,
  rule: AnyColumn,
  options: ExpandOptions = {},
): SQL {
  const where =
    options.where === undefined
      ? sql``
      : sql` WHERE ${sql`${inlineLiterals(options.where)}`.inlineParams()}`;
  const rules = new SQL(getTableAsAliasSQL(getColumnTable(rule)));

  return sql`(SELECT pdb.expand(${text}, ${rule}) FROM ${rules}${where})`;
}

export function phrase(column: SQLWrapper, value: SearchValue): SQL<boolean> {
  return sql<boolean>`${column} ### ${renderSearchValue(value)}`;
}

export function phrasePrefix(
  column: SQLWrapper,
  phrases: string[],
  maxExpansions?: number,
): SQL<boolean> {
  return maxExpansions === undefined
    ? sql<boolean>`${column} @@@ pdb.phrase_prefix(${renderStringArray(phrases)})`
    : sql<boolean>`${column} @@@ pdb.phrase_prefix(${renderStringArray(phrases)}, ${maxExpansions})`;
}

export type RegexPhraseOptions = {
  slop?: number;
  maxExpansions?: number;
};

export function regexPhrase(
  column: SQLWrapper,
  phrases: string[],
  options: RegexPhraseOptions = {},
): SQL<boolean> {
  const args = [renderStringArray(phrases)];

  if (options.slop !== undefined) args.push(sql`slop => ${options.slop}`);
  if (options.maxExpansions !== undefined)
    args.push(sql`max_expansions => ${options.maxExpansions}`);

  return sql<boolean>`${column} @@@ pdb.regex_phrase(${sql.join(args, sql`, `)})`;
}

export function term(column: SQLWrapper, value: SearchValue): SQL<boolean> {
  return sql<boolean>`${column} === ${renderSearchValue(value)}`;
}

export function regex(column: SQLWrapper, pattern: string): SQL<boolean> {
  return sql<boolean>`${column} @@@ pdb.regex(${pattern})`;
}

export type RangeTermRelation = "Intersects" | "Contains" | "Within";
type RangeTermValue = number | bigint | Date | SQLWrapper;
type RangeTermRangeValue = string | SQLWrapper;
export function rangeTerm(
  column: AnyColumn,
  value: RangeTermValue,
): SQL<boolean>;
export function rangeTerm(
  column: AnyColumn,
  value: RangeTermRangeValue,
  relation: RangeTermRelation,
): SQL<boolean>;
export function rangeTerm(
  column: AnyColumn,
  value: RangeTermValue | RangeTermRangeValue,
  relation?: RangeTermRelation,
): SQL<boolean> {
  return relation === undefined
    ? sql<boolean>`${column} @@@ pdb.range_term(${value}::${sql.raw(rangeElementCastType(column))})`
    : sql<boolean>`${column} @@@ pdb.range_term(${value}::${sql.raw(columnCastType(column))}, ${relation})`;
}

function rangeElementCastType(column: AnyColumn): string {
  const sqlType = columnCastType(column);
  if (sqlType === "int4range") return "int4";
  if (sqlType === "int8range") return "int8";
  if (sqlType === "numrange") return "numeric";
  if (sqlType === "daterange") return "date";
  if (sqlType === "tsrange") return "timestamp";
  if (sqlType === "tstzrange") return "timestamptz";
  return sqlType;
}

export class ProximityExpr implements SQLWrapper {
  private expr: SQL;

  constructor(expr: SQL) {
    this.expr = expr;
  }

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

type ProximityValue = string | ProximityExpr;

export function proximity(
  column: SQLWrapper,
  value: ProximityValue,
): SQL<boolean> {
  return sql<boolean>`${column} @@@ ${value}`;
}

export function all(column: SQLWrapper): SQL<boolean> {
  return sql<boolean>`${column} @@@ pdb.all()`;
}

export type ParseOptions = {
  lenient?: boolean;
  conjunctionMode?: boolean;
};

export function parse(
  column: SQLWrapper,
  query: string,
  options?: ParseOptions,
): SQL<boolean>;
export function parse(column: SQLWrapper, query: SQLWrapper): SQL<boolean>;
export function parse(
  column: SQLWrapper,
  query: string | SQLWrapper,
  options?: ParseOptions,
): SQL<boolean>;
export function parse(
  column: SQLWrapper,
  query: string | SQLWrapper,
  options: ParseOptions = {},
): SQL<boolean> {
  // `pdb.parse` takes only text, and `expand` already returns a query.
  if (typeof query !== "string") {
    if (Object.values(options).some((option) => option !== undefined))
      throw new Error("parse options do not apply to an expansion");
    return sql<boolean>`${column} @@@ ${query}`;
  }

  const args = [sql`${query}`];

  if (options.lenient !== undefined)
    args.push(sql`lenient => ${options.lenient}`);
  if (options.conjunctionMode !== undefined)
    args.push(sql`conjunction_mode => ${options.conjunctionMode}`);

  return sql<boolean>`${column} @@@ pdb.parse(${sql.join(args, sql`, `)})`;
}

export type MoreLikeThisDocumentOptions = {
  minTermFrequency?: number;
  minDocFrequency?: number;
  maxDocFrequency?: number;
  maxQueryTerms?: number;
  minWordLength?: number;
  maxWordLength?: number;
  stopwords?: string[];
};

export type MoreLikeThisOptions = MoreLikeThisDocumentOptions & {
  fields?: string[];
};

export function moreLikeThisDocument(
  column: SQLWrapper,
  document: Record<string, unknown>,
  options: MoreLikeThisDocumentOptions = {},
): SQL<boolean> {
  const args = collectMoreLikeThisOptions(options);
  return args.length
    ? sql<boolean>`${column} @@@ pdb.more_like_this(document => ${JSON.stringify(document)}, ${sql.join(args, sql`, `)})`
    : sql<boolean>`${column} @@@ pdb.more_like_this(document => ${JSON.stringify(document)})`;
}

export function moreLikeThisId(
  column: AnyColumn,
  id: unknown,
  options: MoreLikeThisOptions = {},
): SQL<boolean> {
  const sqlType = sql.raw(columnCastType(column));
  const args = collectMoreLikeThisOptions(options);
  return args.length
    ? sql<boolean>`${column} @@@ pdb.more_like_this(key_value => ${id}::${sqlType}, ${sql.join(args, sql`, `)})`
    : sql<boolean>`${column} @@@ pdb.more_like_this(key_value => ${id}::${sqlType})`;
}

function collectMoreLikeThisOptions(options: MoreLikeThisOptions): SQL[] {
  const args: SQL[] = [];
  if (options?.fields !== undefined)
    args.push(sql`fields => ${renderStringArray(options.fields)}`);
  if (options?.minTermFrequency !== undefined)
    args.push(sql`min_term_frequency => ${options.minTermFrequency}`);
  if (options?.minDocFrequency !== undefined)
    args.push(sql`min_doc_frequency => ${options.minDocFrequency}`);
  if (options?.maxDocFrequency !== undefined)
    args.push(sql`max_doc_frequency => ${options.maxDocFrequency}`);
  if (options?.maxQueryTerms !== undefined)
    args.push(sql`max_query_terms => ${options.maxQueryTerms}`);
  if (options?.minWordLength !== undefined)
    args.push(sql`min_word_length => ${options.minWordLength}`);
  if (options?.maxWordLength !== undefined)
    args.push(sql`max_word_length => ${options.maxWordLength}`);
  if (options?.stopwords !== undefined)
    args.push(sql`stopwords => ${renderStringArray(options.stopwords)}`);
  return args;
}

export class Agg extends SQL {
  private windowExpr: SQL;
  private windowBaseExpr: SQL;

  constructor(expr: SQL, windowExpr: SQL, windowBaseExpr: SQL = expr) {
    super(expr.queryChunks);
    this.windowExpr = windowExpr;
    this.windowBaseExpr = windowBaseExpr;
  }

  filter(where: SQLWrapper): Agg {
    const expr = sql`${this} FILTER (WHERE ${where})`;
    return new Agg(
      expr,
      sql`${this.windowBaseExpr} FILTER (WHERE ${where}) OVER ()`,
      expr,
    );
  }

  over(): SQL {
    return this.windowExpr;
  }
}

export type AggregateVisibility = "transaction" | "raw" | "threshold";

/** Combine a facet across GROUP BY groups.
 * Emits pdb.combine_agg(pdb.agg(...)) OVER ().
 */
export function combineAgg(
  spec: Record<string, unknown>,
  visibility?: boolean | AggregateVisibility,
): SQL {
  return sql`pdb.combine_agg(${aggregateExpression(spec, visibility, true)}) OVER ()`;
}

export function agg(
  agg: Record<string, unknown>,
  visibility?: boolean | AggregateVisibility,
): Agg {
  const expr = aggregateExpression(agg, visibility, false);
  const windowBaseExpr = aggregateExpression(agg, visibility, true);
  return new Agg(expr, sql`${windowBaseExpr} OVER ()`, windowBaseExpr);
}

function aggregateExpression(
  spec: Record<string, unknown>,
  visibility: boolean | AggregateVisibility | undefined,
  inline: boolean,
): SQL {
  if (!inline) {
    const payload = sql.param(spec);
    return visibility === undefined
      ? sql`pdb.agg(${payload})`
      : sql`pdb.agg(${payload}, ${visibility})`;
  }
  const payload = JSON.stringify(spec);
  return visibility === undefined
    ? sql`pdb.agg(${sql.raw(quote(payload))})`
    : sql`pdb.agg(${sql.raw(quote(payload))}, ${sql.raw(typeof visibility === "string" ? quote(visibility) : String(visibility))})`;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function columnCastType(column: AnyColumn): string {
  const sqlType = column.getSQLType();
  if (sqlType === "serial") return "integer";
  if (sqlType === "smallserial") return "smallint";
  if (sqlType === "bigserial") return "bigint";
  return sqlType;
}

function renderSearchValue(value: SearchValue): SQL {
  return Array.isArray(value) ? renderStringArray(value) : sql`${value}`;
}

function renderStringArray(values: string[]): SQL {
  return sql`ARRAY[${sql.join(values, sql`, `)}]`;
}
