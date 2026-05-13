import { and, desc, gt } from "drizzle-orm";

import { client, db } from "../src/db.js";
import { matchAll, score, tokenize, tokenizers } from "../src/search.js";
import { mockItems } from "../src/schema.js";

const query = db
  .select({
    description: mockItems.description,
    rating: mockItems.rating,
    category: mockItems.category,
    ngramTokens: tokenize(mockItems.description, tokenizers.ngram(2, 2)),
    searchScore: score(mockItems.id),
  })
  .from(mockItems)
  .where(matchAll(mockItems.description, "running shoes", tokenizers.simple({ stemmer: "english" })))
  .orderBy(desc(score(mockItems.id)))
  .limit(5);

console.log(query.toSQL());

const rows = await query;

console.table(rows);

await client.end();
