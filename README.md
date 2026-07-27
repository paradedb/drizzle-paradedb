<h1 align="center">
  <a href="https://paradedb.com">
    <picture align=center>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/paradedb/paradedb/raw/main/docs/logo/paradedb-logo-dark-large.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://github.com/paradedb/paradedb/raw/main/docs/logo/paradedb-logo-light-large.svg">
      <img alt="The ParadeDB logo." src="https://github.com/paradedb/paradedb/raw/main/docs/logo/paradedb-logo-light-large.svg">
    </picture>
  </a>
  <br>
</h1>

<p align="center">
  <b>Search without a second system.</b><br/>
  One Postgres for your application data, full-text search, vector retrieval, and aggregations.
</p>

<h3 align="center">
  <a href="https://paradedb.com">Website</a> &bull;
  <a href="https://docs.paradedb.com">Docs</a> &bull;
  <a href="https://paradedb.com/slack/">Community</a> &bull;
  <a href="https://paradedb.com/blog/">Blog</a> &bull;
  <a href="https://docs.paradedb.com/changelog/">Changelog</a>
</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@paradedb/drizzle-paradedb"><img src="https://img.shields.io/npm/v/@paradedb/drizzle-paradedb" alt="npm"></a>&nbsp;
  <a href="https://www.npmjs.com/package/@paradedb/drizzle-paradedb"><img src="https://img.shields.io/node/v/@paradedb/drizzle-paradedb" alt="Node Versions"></a>&nbsp;
  <a href="https://www.npmjs.com/package/@paradedb/drizzle-paradedb"><img src="https://img.shields.io/npm/dm/@paradedb/drizzle-paradedb" alt="Downloads"></a>&nbsp;
  <a href="https://codecov.io/gh/paradedb/drizzle-paradedb"><img src="https://codecov.io/gh/paradedb/drizzle-paradedb/graph/badge.svg" alt="Codecov"></a>&nbsp;
  <a href="https://github.com/paradedb/drizzle-paradedb?tab=MIT-1-ov-file#readme"><img src="https://img.shields.io/github/license/paradedb/drizzle-paradedb?color=blue" alt="License"></a>&nbsp;
  <a href="https://paradedb.com/slack"><img src="https://img.shields.io/badge/Join%20Slack-purple?logo=slack" alt="Community"></a>&nbsp;
  <a href="https://x.com/paradedb"><img src="https://img.shields.io/twitter/url?url=https%3A%2F%2Ftwitter.com%2Fparadedb&label=Follow%20%40paradedb" alt="Follow @paradedb"></a>
</p>

---

# ParadeDB for Drizzle

The official [Drizzle](https://orm.drizzle.team/) integration for [ParadeDB](https://paradedb.com) (powered by the [`pg_search`](https://github.com/paradedb/paradedb) Postgres extension), including first-class support for managing ParadeDB indexes and running queries using the full ParadeDB API. Follow the [getting started guide](https://docs.paradedb.com/documentation/getting-started/environment#drizzle) to begin.

## Requirements & Compatibility

| Component  | Supported                     |
| ---------- | ----------------------------- |
| Node       | 22.12+                        |
| Drizzle    | 1.0+                          |
| ParadeDB   | 0.25.0+                       |
| PostgreSQL | 15+ (with ParadeDB extension) |

## Vector Search

ParadeDB can index [pgvector](https://github.com/pgvector/pgvector) `vector` columns directly inside a ParadeDB index. Declare the column with Drizzle's `vector` type (re-exported by this package), pick a distance metric for the index, and query with the matching distance operator:

```ts
import { pgTable, integer, text } from "drizzle-orm/pg-core";
import { indexing, search } from "@paradedb/drizzle-paradedb";

const items = pgTable(
  "items",
  {
    id: integer("id").primaryKey(),
    description: text("description").notNull(),
    embedding: indexing.vector("embedding", { dimensions: 384 }),
  },
  (table) => [
    indexing
      .paradedbIndex("items_search_idx")
      .on(
        table.id,
        table.description,
        indexing.vectorField(table.embedding, "cosine"),
      ),
  ],
);
```

This emits `CREATE INDEX ... USING paradedb ("id", "description", "embedding" vector_cosine_ops) WITH (key_field=id)`.

Top-K nearest-neighbor queries need two things to be served by the index: a `@@@` predicate (use `search.all` to match every row) and a `LIMIT`:

```ts
const results = await db
  .select({ id: items.id, description: items.description })
  .from(items)
  .where(search.all(items.id))
  .orderBy(search.cosineDistance(items.embedding, queryEmbedding))
  .limit(10);
```

Replace `search.all` with any other predicate (e.g. `search.matchAll`) to filter candidates before ranking by distance.

The `ORDER BY` distance function must match the metric the index was built with, otherwise the query still returns correct results but falls back to a plain sort instead of Top-K index pushdown:

| Metric (`vectorField`) | Operator class      | Distance function       | Operator |
| ---------------------- | ------------------- | ----------------------- | -------- |
| `"l2"` (default)       | `vector_l2_ops`     | `search.l2Distance`     | `<->`    |
| `"cosine"`             | `vector_cosine_ops` | `search.cosineDistance` | `<=>`    |
| `"ip"`                 | `vector_ip_ops`     | `search.innerProduct`   | `<#>`    |

Vector fields in ParadeDB indexes require a pg_search version newer than 0.24; on older versions index creation fails and the [vector search example](examples/vector-search.ts) and tests skip themselves.

## Examples

Run all examples:

```bash
pnpm examples
```

Or a specific one:

```bash
pnpm examples autocomplete.ts
```

- [Quickstart](examples/quickstart.ts)
- [Faceted search](examples/faceted-search.ts)
- [Autocomplete](examples/autocomplete.ts)
- [More Like This](examples/more-like-this.ts)
- [Hybrid RRF](examples/hybrid-rrf.ts)
- [Vector search](examples/vector-search.ts)
- [RAG](examples/rag.ts)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, running tests, linting, and the PR workflow.

## Support

If you're missing a feature or have found a bug, please open a
[GitHub Issue](https://github.com/paradedb/drizzle-paradedb/issues/new/choose).

To get community support, you can:

- Post a question in the [ParadeDB Slack Community](https://paradedb.com/slack)
- Ask for help on our [GitHub Discussions](https://github.com/paradedb/paradedb/discussions)

If you need commercial support, please [contact the ParadeDB team](mailto:sales@paradedb.com).

## License

ParadeDB for Drizzle is licensed under the [MIT License](LICENSE).
