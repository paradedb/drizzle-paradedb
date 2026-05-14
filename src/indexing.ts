import { sql, SQL, SQLWrapper } from "drizzle-orm";
import { index, IndexBuilder, PgColumn } from "drizzle-orm/pg-core";
import {
  renderSearchTokenizer,
  renderTokenizer,
  Tokenizer,
} from "./tokenizer.js";

type IndexField = PgColumn | SQL;

type Bm25IndexOptions = {
  searchTokenizer?: Tokenizer;
};

export function bm25Index(name?: string, options: Bm25IndexOptions = {}): {
  on(keyField: PgColumn, ...fields: IndexField[]): IndexBuilder;
} {
  return {
    on(keyField, ...fields) {
      const withOptions: Record<string, string> = { key_field: keyField.name };
      if (options.searchTokenizer) {
        withOptions.search_tokenizer = quote(
          renderSearchTokenizer(options.searchTokenizer),
        );
      }

      return index(name)
        .using("bm25", keyField, ...fields)
        .with(withOptions);
    },
  };
}

export function bm25Field(field: SQLWrapper, tokenizer: Tokenizer): SQL {
  return sql`((${field})::${sql.raw(renderTokenizer(tokenizer))})`;
}

export function jsonText(column: SQLWrapper, key: string): SQL {
  return sql`${column} ->> ${sql.raw(quote(key))}`;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
