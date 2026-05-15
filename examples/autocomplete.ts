import { desc } from "drizzle-orm";
import {
  autocompleteItems,
  closeDb,
  db,
  setupAutocompleteItems,
} from "./common.js";
import { search } from "../src/index.js";

export async function runAutocomplete(): Promise<void> {
  console.log("=".repeat(60));
  console.log("drizzle-paradedb Autocomplete Example");
  console.log("Fast as-you-type search");
  console.log("=".repeat(60));

  await setupAutocompleteItems();

  console.log("=".repeat(60));
  console.log("Autocomplete");
  console.log("=".repeat(60));
  for (const query of [
    "run",
    "runn",
    "running",
    "wire",
    "wirel",
    "wireles",
    "wireless",
    "blue",
    "blueto",
    "bluetooth",
  ]) {
    console.log(`\nUser types: '${query}' →`);

    const rows = await db
      .select({
        description: autocompleteItems.description,
        score: search.score(autocompleteItems.id),
      })
      .from(autocompleteItems)
      .where(search.parse(autocompleteItems.id, `description_ngram:${query}`))
      .orderBy(desc(search.score(autocompleteItems.id)))
      .limit(5);

    if (rows.length === 0) {
      console.log("  (no results)");
      continue;
    }

    for (const item of rows) {
      console.log(
        `  • ${item.description.slice(0, 50)}... (score: ${item.score.toFixed(2)})`,
      );
    }
  }

  console.log("\nDone.");
}

try {
  await runAutocomplete();
} finally {
  await closeDb();
}
