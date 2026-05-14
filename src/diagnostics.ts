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
