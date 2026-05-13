import { boolean, customType, date, integer, jsonb, pgTable, text, time, timestamp, varchar } from "drizzle-orm/pg-core";

import { bm25Field, bm25Index, tokenizers } from "./search.js";

const int4range = customType<{ data: string; driverData: string }>({
  dataType() {
    return "int4range";
  },
});

export const mockItems = pgTable("mock_items", {
  id: integer("id").primaryKey(),
  description: text("description"),
  rating: integer("rating"),
  category: varchar("category", { length: 255 }),
  inStock: boolean("in_stock"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at"),
  lastUpdatedDate: date("last_updated_date"),
  latestAvailableTime: time("latest_available_time"),
  weightRange: int4range("weight_range"),
}, (table) => [
  bm25Index("mock_items_search_idx").on(
    table.id,
    bm25Field(table.description, tokenizers.simple({ stemmer: "english" })),
    bm25Field(table.category, tokenizers.literal()),
    table.rating,
    table.inStock,
    table.metadata,
    table.createdAt,
    table.lastUpdatedDate,
    table.latestAvailableTime,
    table.weightRange,
  ),
]);
