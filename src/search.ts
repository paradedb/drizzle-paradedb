import { AnyColumn, SQL, sql, type SQLWrapper } from "drizzle-orm";
import { Tokenizer, renderTokenizer } from "./tokenizer.js";

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
  options: ParseOptions = {},
): SQL<boolean> {
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
  id: any,
  options: MoreLikeThisOptions = {},
): SQL<boolean> {
  const sqlType = sql.raw(columnCastType(column));
  const args = collectMoreLikeThisOptions(options);
  return args.length
    ? sql<boolean>`${column} @@@ pdb.more_like_this(key_value => ${id}::${sqlType}, ${sql.join(args, sql`, `)})`
    : sql<boolean>`${column} @@@ pdb.more_like_this(key_value => ${id}::${sqlType})`;
}

function collectMoreLikeThisOptions(options: MoreLikeThisOptions): SQL[] {
  var args: SQL[] = [];
  if (options?.fields !== undefined)
    args.push(sql`fields => ${renderStringArray(options.fields)}`);
  if (options?.minTermFrequency !== undefined)
    args.push(sql`min_term_frequency => ${options!.minTermFrequency}`);
  if (options?.minDocFrequency !== undefined)
    args.push(sql`min_doc_frequency => ${options!.minDocFrequency}`);
  if (options?.maxDocFrequency !== undefined)
    args.push(sql`max_doc_frequency => ${options!.maxDocFrequency}`);
  if (options?.maxQueryTerms !== undefined)
    args.push(sql`max_query_terms => ${options!.maxQueryTerms}`);
  if (options?.minWordLength !== undefined)
    args.push(sql`min_word_length => ${options!.minWordLength}`);
  if (options?.maxWordLength !== undefined)
    args.push(sql`max_word_length => ${options!.maxWordLength}`);
  if (options?.stopwords !== undefined)
    args.push(sql`stopwords => ${renderStringArray(options!.stopwords)}`);
  return args;
}

export class Agg extends SQL {
  constructor(
    expr: SQL,
    private windowExpr: SQL,
    private windowBaseExpr: SQL = expr,
  ) {
    super(expr.queryChunks);
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

export function agg(agg: Record<string, unknown>, exact?: boolean): Agg {
  const payload = JSON.stringify(agg);
  const expr =
    exact === undefined
      ? sql`pdb.agg(${payload})`
      : sql`pdb.agg(${payload}, ${exact})`;
  const windowBaseExpr =
    exact === undefined
      ? sql`pdb.agg(${sql.raw(quote(payload))})`
      : sql`pdb.agg(${sql.raw(quote(payload))}, ${sql.raw(String(exact))})`;

  return new Agg(expr, sql`${windowBaseExpr} OVER ()`, windowBaseExpr);
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
