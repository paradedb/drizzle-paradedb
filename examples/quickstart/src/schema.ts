import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";
import {
  paradedbField,
  paradedbIndex,
  tokenizer,
  vector,
  vectorField,
} from "@paradedb/drizzle-paradedb";

export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull(),
    published: boolean("published").default(true),
    metadata: jsonb("metadata"),
    embedding: vector("embedding", { dimensions: 4 }),
  },
  (table) => [
    // Define a ParadeDB BM25 + Vector search index directly in Drizzle schema!
    paradedbIndex("articles_search_idx").on(
      table.id,
      paradedbField(table.title, tokenizer.unicodeWords()),
      paradedbField(
        table.content,
        tokenizer.icu({ stemmer: "english", stopwords: "english" })
      ),
      paradedbField(table.category, tokenizer.literal()),
      vectorField(table.embedding, "cosine")
    ),
  ]
);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
