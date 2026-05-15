# Testing

Run the tests to verify every change:

```bash
pnpm db:setup
pnpm test
```

To run a subset of tests, pass vitest selectors:

```bash
pnpm test tests/queries.test.ts -t "score"
```

`pnpm db:setup` starts a ParadeDB container and exports `DATABASE_URL`. The default container name is `drizzle-paradedb` on port `5432`.

Some integration tests require newer pg_search versions and will be automatically skipped if the feature is not available.

## Changelog

When you make a change that a user of this project would care about, record it in the `Unreleased` section of the changelog. If the change is breaking, make sure to denote that.
