# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-10-07

### Added

- Index partitioning, target segment count, and vector quantization configuration.
- Vector storage, configuration, and estimator diagnostics, plus aggregation visibility modes.
- Snippet-position pagination with `limit` and `offset`.
- Index layer sizes, background layer sizes, and mutable segment row limits.

### Changed

- **Breaking:** `paradedbIndex().on()` treats every argument as an indexed field, accepts an expression first, and no longer generates `key_field`. Require ParadeDB 0.26.0 or newer.
- **Breaking:** Update vector index build options to `trainingSampleRatio` and `maxLeafSize` for ParadeDB 0.26.0 and remove the obsolete cluster replication option.

## [0.5.0] - 2026-08-21

### Changed

- Upgraded to Drizzle 1.0.0-rc.4.

## [0.4.0] - 2026-08-04

### Added

- Vector index build options on `paradedbIndex`: `centroidRatio`, `trainingSamplesPerCentroid`, and `clusterReplication`, emitted as `centroid_ratio`, `training_samples_per_centroid`, and `cluster_replication` in the index `WITH` clause.

## [0.3.0] - 2026-08-04

### Added

- Native vector search support: `vector` columns and `vectorField` opclasses in ParadeDB indexes, plus `l2Distance`/`cosineDistance`/`innerProduct` re-exports for Top-K queries ([paradedb/paradedb#5685](https://github.com/paradedb/paradedb/issues/5685)).

### Changed

- **Breaking**: `bm25Index`, `bm25Field`, and `Bm25IndexOptions` are renamed to `paradedbIndex`, `paradedbField`, and `ParadedbIndexOptions`, and indexes are always created with `USING paradedb`, which requires pg_search 0.25.0+ ([paradedb/paradedb#5706](https://github.com/paradedb/paradedb/issues/5706)).

## [0.2.0] - 2025-07-14

### Changed

- Updated documentation and copy.

## [0.1.0] - 2025-05-19

### Added

- Support for the ParadeDB query language, index management, and diagnostics.

[0.6.0]: https://github.com/paradedb/drizzle-paradedb/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/paradedb/drizzle-paradedb/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/paradedb/drizzle-paradedb/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/paradedb/drizzle-paradedb/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/paradedb/drizzle-paradedb/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/paradedb/drizzle-paradedb/compare/v0.1.0
