import { sql, type AnyColumn, type SQL, type SQLWrapper } from "drizzle-orm";
import { index, type IndexBuilder, type PgColumn } from "drizzle-orm/pg-core";
import type { TypedQueryBuilder } from "drizzle-orm/query-builders/query-builder";

type TokenizerArg = string | number | boolean;
type TokenizerOptions = Record<string, TokenizerArg>;
type IndexField = PgColumn | SQL;
type SearchValue = string | SQLWrapper | TypedQueryBuilder<any>;

export type Tokenizer = {
  name: string;
  args?: readonly TokenizerArg[];
  options?: TokenizerOptions;
};

export function bm25Index(name?: string): {
  on(keyField: PgColumn, ...fields: IndexField[]): IndexBuilder;
} {
  return {
    on(keyField, ...fields) {
      return index(name)
        .using("bm25", keyField, ...fields)
        .with({ key_field: keyField.name });
    },
  };
}

export function bm25Field(field: SQLWrapper | AnyColumn, tokenizer: Tokenizer): SQL {
  return sql`((${field})::${sql.raw(renderTokenizer(tokenizer))})`;
}

export function pdbAlias(field: SQLWrapper | AnyColumn, alias: string): SQL {
  return sql`((${field})::pdb.alias(${sql.raw(quote(alias))}))`;
}

export function jsonText(column: SQLWrapper | AnyColumn, key: string): SQL {
  return sql`${column} ->> ${sql.raw(quote(key))}`;
}

export function tokenizer(name: string, args: readonly TokenizerArg[] = [], options?: TokenizerOptions): Tokenizer {
  return { name, args, options };
}

export const tokenizers = {
  unicodeWords: (options?: TokenizerOptions) => tokenizer("unicode_words", [], options),
  simple: (options?: TokenizerOptions) => tokenizer("simple", [], options),
  icu: (options?: TokenizerOptions) => tokenizer("icu", [], options),
  literal: (options?: TokenizerOptions) => tokenizer("literal", [], options),
  literalNormalized: (options?: TokenizerOptions) => tokenizer("literal_normalized", [], options),
  ngram: (minGram: number, maxGram: number, options?: TokenizerOptions) =>
    tokenizer("ngram", [minGram, maxGram], options),
  edgeNgram: (minGram: number, maxGram: number, options?: TokenizerOptions) =>
    tokenizer("edge_ngram", [minGram, maxGram], options),
};

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

function renderTokenizer({ name, args = [], options }: Tokenizer): string {
  const renderedArgs = args.map(renderArg);
  for (const [key, value] of Object.entries(options ?? {})) {
    renderedArgs.push(quote(`${key}=${renderOptionValue(value)}`));
  }

  if (renderedArgs.length === 0) {
    return `pdb.${name}`;
  }

  return `pdb.${name}(${renderedArgs.join(",")})`;
}

function renderArg(value: TokenizerArg): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return quote(value);
}

function renderOptionValue(value: TokenizerArg): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
