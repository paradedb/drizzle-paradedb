# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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

[0.2.0]: https://github.com/paradedb/drizzle-paradedb/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/paradedb/drizzle-paradedb/compare/v0.1.0
