import { sql, SQL, SQLWrapper } from "drizzle-orm";
import { index, IndexBuilder, PgColumn } from "drizzle-orm/pg-core";
import { renderTokenizer, Tokenizer } from "./tokenizer.js";

type IndexField = PgColumn | SQL;

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

export function bm25Field(field: SQLWrapper, tokenizer: Tokenizer): SQL {
  return sql`((${field})::${sql.raw(renderTokenizer(tokenizer))})`;
}

export function pdbAlias(field: SQLWrapper, alias: string): SQL {
  return sql`((${field})::pdb.alias(${sql.raw(quote(alias))}))`;
}

export function jsonText(column: SQLWrapper, key: string): SQL {
  return sql`${column} ->> ${sql.raw(quote(key))}`;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
