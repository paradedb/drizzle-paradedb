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
  trainingSampleRatio?: number;
  maxLeafSize?: number;
  /** Comma-separated names of single-valued columnar index fields. */
  partitionBy?: string;
  targetSegmentCount?: number;
  vectorFields?: Record<
    string,
    { quantization?: boolean | { layers: readonly (1 | 2 | 3 | 4)[] } }
  >;
};

export function paradedbIndex(
  name?: string,
  options: ParadedbIndexOptions = {},
): {
  on(...fields: [IndexField, ...IndexField[]]): IndexBuilder;
} {
  return {
    on(...fields) {
      const withOptions: Record<string, string> = {};
      if (options.searchTokenizer) {
        withOptions.search_tokenizer = quote(
          renderSearchTokenizer(options.searchTokenizer),
        );
      }
      if (options.trainingSampleRatio !== undefined) {
        withOptions.training_sample_ratio = String(options.trainingSampleRatio);
      }
      if (options.maxLeafSize !== undefined) {
        withOptions.max_leaf_size = String(options.maxLeafSize);
      }

      if (options.partitionBy !== undefined) {
        if (
          !options.partitionBy
            .split(",")
            .every((field) => field.trim().length > 0)
        ) {
          throw new Error(
            "partitionBy must contain non-empty index field names",
          );
        }
        withOptions.partition_by = quote(options.partitionBy);
      }
      if (options.targetSegmentCount !== undefined) {
        if (
          !Number.isInteger(options.targetSegmentCount) ||
          options.targetSegmentCount < 1 ||
          options.targetSegmentCount > 2147483647
        ) {
          throw new Error(
            "targetSegmentCount must be an integer between 1 and 2147483647",
          );
        }
        withOptions.target_segment_count = String(options.targetSegmentCount);
      }
      if (options.vectorFields !== undefined) {
        withOptions.vector_fields = quote(JSON.stringify(options.vectorFields));
      }

      const builder = index(name).using("paradedb", ...fields);
      return Object.keys(withOptions).length
        ? builder.with(withOptions)
        : builder;
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
