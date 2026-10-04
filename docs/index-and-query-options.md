# Index and query options

## Partitioning and vector configuration

[ParadeDB 0.26.0](https://www.paradedb.com/docs/project/changelog/0.26.0) adds segment partitioning and quantized vector storage. Partition keys are comma-separated **index field names**, including tokenizer aliases when applicable. Each key must be single-valued and columnar. Numeric columns work directly; text keys need a columnar tokenizer such as `literal`. PostgreSQL validates the field types when creating the index.

```typescript
import { diagnostics, indexing, search } from "@paradedb/drizzle-paradedb";

// Use inside pgTable's index callback.
indexing
  .paradedbIndex("items_search_idx", {
    partitionBy: "tenant_id",
    targetSegmentCount: 8,
    vectorFields: { embedding: { quantization: false } },
  })
  .on(
    table.id,
    table.tenantId,
    table.description,
    indexing.vectorField(table.embedding, "cosine"),
  );

search.agg({ value_count: { field: "id" } }, "threshold");
await db.execute(diagnostics.vectorConfig("items_search_idx", "embedding"));
```

Generated migrations include the configured options. The visibility argument also works with `.filter()` and `.over()`.

`target_segment_count` is a positive integer. Omit an option to retain the server default. Quantization can be disabled per vector field or configured with `{"quantization": {"layers": [1, 4]}}`. Quantization changes take effect at `CREATE INDEX` or `REINDEX`, so changing a reloption alone does not rebuild stored vectors.

The experimental stacked IVF router is available through `vectorRouter: "ivf"`. Its default remains `graph`.

## Aggregate visibility

- `transaction` applies transaction visibility checks and is the default.
- `raw` skips visibility checks and may include deleted or otherwise invisible rows.
- `threshold` applies checks only when the estimated match count is below `paradedb.visibility_threshold`.

The existing boolean argument option remains supported. When using a named visibility option, omit the legacy boolean option.

Combining `FILTER` with a window aggregate is subject to server feature flags in 0.26.0.

## Vector diagnostics

Use `vectorInfo`, `vectorConfig`, and `vectorEstimatorInfo` to inspect vector storage, build configuration, and estimator error. Each accepts an index name and vector field name. The estimator helper also accepts an optional collection of query vectors. Names and queries are safely quoted or passed as SQL parameters.

Estimator diagnostics require at least one visible quantized IVF segment. An empty index or an index with only flat or unquantized segments returns a PostgreSQL error. Flat segments return null for IVF and quantization metadata where it does not apply. These are diagnostic operations, especially the estimator, and should not run on every application request.

## Tokenizer options

The existing tokenizer option dictionaries support the new options:

```typescript
tokenizer.simple({ pnorms: true });
tokenizer.jieba({ search_mode: false });
tokenizer.chineseCompatible({ chinese_convert: "t2s" });
```

## Planner improvements and runtime settings

DISTINCT, aggregates over joins, date grouping, and range ordering use normal ORM query expressions. ParadeDB chooses eligible pushdowns automatically. Runtime settings, including spill behavior and vector scan limits, can be configured through the framework's normal SQL connection API and require no separate query helpers.
