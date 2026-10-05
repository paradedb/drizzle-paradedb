import { sql, type SQL } from "drizzle-orm";

export type VerifyIndexOptions = {
  heapAllIndexed?: boolean;
  sampleRate?: number;
  reportProgress?: boolean;
  verbose?: boolean;
  onErrorStop?: boolean;
  segmentIds?: number[];
};

export type VerifyAllIndexesOptions = Omit<
  VerifyIndexOptions,
  "verbose" | "segmentIds"
> & {
  schemaPattern?: string;
  indexPattern?: string;
};

export type VerifyIndexResult = {
  check_name: string;
  passed: boolean;
  details: string;
};

export type IndexSegment = {
  partition_name: string;
  segment_idx: number;
  segment_id: string;
  num_docs: number;
  num_deleted: number;
  max_doc: number;
};

export type IndexInfo = {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexrelid: number;
  num_segments: number;
  total_docs: number;
};

export function verifyIndex(
  index: string,
  options: VerifyIndexOptions = {},
): SQL<VerifyIndexResult[]> {
  return sql`SELECT * FROM pdb.verify_index(${index}${renderVerifyIndexOptions(options)})`;
}

export function verifyAllIndexes(
  options: VerifyAllIndexesOptions = {},
): SQL<VerifyIndexResult[]> {
  const args: SQL[] = [];

  if (options.schemaPattern !== undefined)
    args.push(sql`schema_pattern => ${options.schemaPattern}`);
  if (options.indexPattern !== undefined)
    args.push(sql`index_pattern => ${options.indexPattern}`);
  args.push(...collectVerifyOptions(options));

  return sql`SELECT * FROM pdb.verify_all_indexes(${sql.join(args, sql`, `)})`;
}

export function indexSegments(index: string): SQL<IndexSegment[]> {
  return sql`SELECT * FROM pdb.index_segments(${index})`;
}

export function indexes(): SQL<IndexInfo[]> {
  return sql`SELECT * FROM pdb.indexes()`;
}

function renderVerifyIndexOptions(options: VerifyIndexOptions): SQL {
  const args = collectVerifyOptions(options);

  if (options.verbose !== undefined)
    args.push(sql`verbose => ${options.verbose}`);
  if (options.segmentIds !== undefined)
    args.push(sql`segment_ids => ${renderIntegerArray(options.segmentIds)}`);

  return args.length ? sql`, ${sql.join(args, sql`, `)}` : sql``;
}

function collectVerifyOptions(
  options: VerifyIndexOptions | VerifyAllIndexesOptions,
): SQL[] {
  const args: SQL[] = [];

  if (options.heapAllIndexed !== undefined)
    args.push(sql`heapallindexed => ${options.heapAllIndexed}`);
  if (options.sampleRate !== undefined)
    args.push(sql`sample_rate => ${options.sampleRate}`);
  if (options.reportProgress !== undefined)
    args.push(sql`report_progress => ${options.reportProgress}`);
  if (options.onErrorStop !== undefined)
    args.push(sql`on_error_stop => ${options.onErrorStop}`);

  return args;
}

function renderIntegerArray(values: number[]): SQL {
  return sql`ARRAY[${sql.join(values, sql`, `)}]::integer[]`;
}

export type VectorConfig = {
  index_oid: number;
  quantized: boolean;
  layers: number[] | null;
  bytes_per_row: number | null;
  settings_version: number | null;
};

export type VectorEstimatorInfo = {
  depth: number;
  bias: number;
  spread: number;
  sample_rows: number;
  query_count: number;
  query_source: string;
};

export type VectorInfo = {
  segno: string;
  vector_field: string;
  vector_format: string;
  vector_num_vectors: string;
  vector_num_centroids: string | null;
  vector_min_cluster_size: string | null;
  vector_max_cluster_size: string | null;
  vector_avg_cluster_size: number | null;
  vector_empty_clusters: string | null;
  vector_total_rows: string | null;
  quantized: boolean;
  layers: number[] | null;
  quantizer_kinds: string[] | null;
  bytes_per_row: number | null;
};

export function vectorInfo(index: string, field: string): SQL<VectorInfo[]> {
  return sql`SELECT * FROM paradedb.vector_info(${index}::regclass, ${field}::text)`;
}

export function vectorConfig(
  index: string,
  field: string,
): SQL<VectorConfig[]> {
  return sql`SELECT * FROM paradedb.vector_config(${index}::regclass, ${field}::text)`;
}

export function vectorEstimatorInfo(
  index: string,
  field: string,
  queries?: readonly (readonly number[])[],
): SQL<VectorEstimatorInfo[]> {
  const queryArg =
    queries === undefined
      ? sql``
      : sql`, ARRAY[${sql.join(
          queries.map((query) => sql`${JSON.stringify(query)}::vector`),
          sql`, `,
        )}]::vector[]`;
  return sql`SELECT * FROM paradedb.vector_estimator_info(${index}::regclass, ${field}::text${queryArg})`;
}
