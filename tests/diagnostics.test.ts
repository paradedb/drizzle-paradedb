import { PgDialect } from "drizzle-orm/pg-core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  indexSegments,
  indexes,
  vectorConfig,
  vectorEstimatorInfo,
  vectorInfo,
  verifyAllIndexes,
  verifyIndex,
} from "../src/diagnostics.ts";

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

    assert.equal(
      query.sql,
      "SELECT * FROM pdb.verify_index($1, heapallindexed => $2, sample_rate => $3, report_progress => $4, on_error_stop => $5, verbose => $6, segment_ids => ARRAY[$7, $8]::integer[])",
    );
    assert.deepStrictEqual(query.params, [
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

    assert.equal(query.sql, "SELECT * FROM pdb.verify_index($1)");
    assert.deepStrictEqual(query.params, ["search_idx"]);
  });

  it("runs verify_all_indexes", () => {
    const query = dialect.sqlToQuery(
      verifyAllIndexes({
        schemaPattern: "public",
        indexPattern: "search_%",
        heapAllIndexed: true,
      }),
    );

    assert.equal(
      query.sql,
      "SELECT * FROM pdb.verify_all_indexes(schema_pattern => $1, index_pattern => $2, heapallindexed => $3)",
    );
    assert.deepStrictEqual(query.params, ["public", "search_%", true]);
  });

  it("runs verify_all_indexes with no options", () => {
    const query = dialect.sqlToQuery(verifyAllIndexes());

    assert.equal(query.sql, "SELECT * FROM pdb.verify_all_indexes()");
    assert.deepStrictEqual(query.params, []);
  });

  it("runs index metadata functions", () => {
    assert.equal(
      dialect.sqlToQuery(indexSegments("search_idx")).sql,
      "SELECT * FROM pdb.index_segments($1)",
    );
    assert.deepStrictEqual(
      dialect.sqlToQuery(indexSegments("search_idx")).params,
      ["search_idx"],
    );
    assert.equal(
      dialect.sqlToQuery(indexes()).sql,
      "SELECT * FROM pdb.indexes()",
    );
  });

  it("runs vector diagnostics", () => {
    const info = dialect.sqlToQuery(vectorInfo("search_idx", "embedding"));
    assert.equal(
      info.sql,
      "SELECT * FROM paradedb.vector_info($1::regclass, $2::text)",
    );
    assert.deepStrictEqual(info.params, ["search_idx", "embedding"]);

    const config = dialect.sqlToQuery(vectorConfig("search_idx", "embedding"));
    assert.equal(
      config.sql,
      "SELECT * FROM paradedb.vector_config($1::regclass, $2::text)",
    );
    assert.deepStrictEqual(config.params, ["search_idx", "embedding"]);

    const estimator = dialect.sqlToQuery(
      vectorEstimatorInfo("search_idx", "embedding"),
    );
    assert.equal(
      estimator.sql,
      "SELECT * FROM paradedb.vector_estimator_info($1::regclass, $2::text)",
    );
    assert.deepStrictEqual(estimator.params, ["search_idx", "embedding"]);

    const estimatorWithQueries = dialect.sqlToQuery(
      vectorEstimatorInfo("search_idx", "embedding", [[0.1, 0.2]]),
    );
    assert.equal(
      estimatorWithQueries.sql,
      "SELECT * FROM paradedb.vector_estimator_info($1::regclass, $2::text, ARRAY[$3::vector]::vector[])",
    );
    assert.deepStrictEqual(estimatorWithQueries.params, [
      "search_idx",
      "embedding",
      "[0.1,0.2]",
    ]);
  });
});
