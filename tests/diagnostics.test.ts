import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  indexSegments,
  indexes,
  vectorConfig,
  vectorEstimatorInfo,
  vectorInfo,
  verifyAllIndexes,
  verifyIndex,
} from "../src/diagnostics.js";

const dialect = new PgDialect();

describe("ParadeDB index diagnostics helpers", () => {
  it("runs verify_index", () => {
    const query = dialect.sqlToQuery(
      verifyIndex("search_idx", {
        heapAllIndexed: true,
        sampleRate: 0.1,
        reportProgress: true,
        verbose: true,
        onErrorStop: true,
        segmentIds: [0, 2],
      }),
    );

    expect(query.sql).toBe(
      "SELECT * FROM pdb.verify_index($1, heapallindexed => $2, sample_rate => $3, report_progress => $4, on_error_stop => $5, verbose => $6, segment_ids => ARRAY[$7, $8]::integer[])",
    );
    expect(query.params).toStrictEqual([
      "search_idx",
      true,
      0.1,
      true,
      true,
      true,
      0,
      2,
    ]);
  });

  it("runs verify_index with no options", () => {
    const query = dialect.sqlToQuery(verifyIndex("search_idx"));

    expect(query.sql).toBe("SELECT * FROM pdb.verify_index($1)");
    expect(query.params).toStrictEqual(["search_idx"]);
  });

  it("runs verify_all_indexes", () => {
    const query = dialect.sqlToQuery(
      verifyAllIndexes({
        schemaPattern: "public",
        indexPattern: "search_%",
        heapAllIndexed: true,
      }),
    );

    expect(query.sql).toBe(
      "SELECT * FROM pdb.verify_all_indexes(schema_pattern => $1, index_pattern => $2, heapallindexed => $3)",
    );
    expect(query.params).toStrictEqual(["public", "search_%", true]);
  });

  it("runs verify_all_indexes with no options", () => {
    const query = dialect.sqlToQuery(verifyAllIndexes());

    expect(query.sql).toBe("SELECT * FROM pdb.verify_all_indexes()");
    expect(query.params).toStrictEqual([]);
  });

  it("runs index metadata functions", () => {
    expect(dialect.sqlToQuery(indexSegments("search_idx")).sql).toBe(
      "SELECT * FROM pdb.index_segments($1)",
    );
    expect(
      dialect.sqlToQuery(indexSegments("search_idx")).params,
    ).toStrictEqual(["search_idx"]);
    expect(dialect.sqlToQuery(indexes()).sql).toBe(
      "SELECT * FROM pdb.indexes()",
    );
  });

  it("runs vector diagnostics", () => {
    const info = dialect.sqlToQuery(vectorInfo("search_idx", "embedding"));
    expect(info.sql).toBe(
      "SELECT * FROM paradedb.vector_info($1::regclass, $2::text)",
    );
    expect(info.params).toStrictEqual(["search_idx", "embedding"]);

    const config = dialect.sqlToQuery(vectorConfig("search_idx", "embedding"));
    expect(config.sql).toBe(
      "SELECT * FROM paradedb.vector_config($1::regclass, $2::text)",
    );
    expect(config.params).toStrictEqual(["search_idx", "embedding"]);

    const estimator = dialect.sqlToQuery(
      vectorEstimatorInfo("search_idx", "embedding"),
    );
    expect(estimator.sql).toBe(
      "SELECT * FROM paradedb.vector_estimator_info($1::regclass, $2::text)",
    );
    expect(estimator.params).toStrictEqual(["search_idx", "embedding"]);

    const estimatorWithQueries = dialect.sqlToQuery(
      vectorEstimatorInfo("search_idx", "embedding", [[0.1, 0.2]]),
    );
    expect(estimatorWithQueries.sql).toBe(
      "SELECT * FROM paradedb.vector_estimator_info($1::regclass, $2::text, ARRAY[$3::vector]::vector[])",
    );
    expect(estimatorWithQueries.params).toStrictEqual([
      "search_idx",
      "embedding",
      "[0.1,0.2]",
    ]);
  });
});
