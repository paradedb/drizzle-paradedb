import { sql, SQL, SQLWrapper } from "drizzle-orm";
import { index, IndexBuilder, PgColumn } from "drizzle-orm/pg-core";
import {
  renderSearchTokenizer,
  renderTokenizer,
  Tokenizer,
} from "./tokenizer.js";

type IndexField = PgColumn | SQL;

export type ParadedbIndexOptions = {
  searchTokenizer?: Tokenizer;
};

export function paradedbIndex(
  name?: string,
  options: ParadedbIndexOptions = {},
): {
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
        .using("paradedb", keyField, ...fields)
        .with(withOptions);
    },
  };
}

export function paradedbField(field: SQLWrapper, tokenizer: Tokenizer): SQL {
  return sql`((${field})::${sql.raw(renderTokenizer(tokenizer))})`;
}

export function jsonText(column: SQLWrapper, key: string): SQL {
  return sql`${column} ->> ${sql.raw(quote(key))}`;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
