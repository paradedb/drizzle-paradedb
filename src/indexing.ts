import { sql, SQL, SQLWrapper } from "drizzle-orm";
import {
  ExtraConfigColumn,
  index,
  IndexBuilder,
  PgColumn,
} from "drizzle-orm/pg-core";
import {
  renderSearchTokenizer,
  renderTokenizer,
  Tokenizer,
} from "./tokenizer.js";

export { vector } from "drizzle-orm/pg-core";

type IndexField = PgColumn | SQL;

export type ParadedbIndexOptions = {
  searchTokenizer?: Tokenizer;
  centroidRatio?: number;
  trainingSamplesPerCentroid?: number;
  clusterReplication?: number;
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
      if (options.centroidRatio !== undefined) {
        withOptions.centroid_ratio = String(options.centroidRatio);
      }
      if (options.trainingSamplesPerCentroid !== undefined) {
        withOptions.training_samples_per_centroid = String(
          options.trainingSamplesPerCentroid,
        );
      }
      if (options.clusterReplication !== undefined) {
        withOptions.cluster_replication = String(options.clusterReplication);
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

export type VectorMetric = "l2" | "cosine" | "ip";

const vectorOpClasses: Record<VectorMetric, string> = {
  l2: "vector_l2_ops",
  cosine: "vector_cosine_ops",
  ip: "vector_ip_ops",
};

export function vectorField(
  column: ExtraConfigColumn,
  metric: VectorMetric = "l2",
): IndexField {
  return column.op(vectorOpClasses[metric]);
}

export function jsonText(column: SQLWrapper, key: string): SQL {
  return sql`${column} ->> ${sql.raw(quote(key))}`;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
