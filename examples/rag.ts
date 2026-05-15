import { desc } from "drizzle-orm";

import { closeDb, db, mockItems, setupMockItems } from "./common.js";
import { search } from "../src/index.js";

const model = process.env.RAG_MODEL ?? "anthropic/claude-3-haiku";

type RetrievedItem = typeof mockItems.$inferSelect & { score: number };

export async function runRag(): Promise<void> {
  console.log("=".repeat(60));
  console.log("RAG with drizzle-paradedb + OpenRouter");
  console.log("=".repeat(60));
  console.log(`Using model: ${model}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.log(
      "OPENROUTER_API_KEY is not set; generation responses will be skipped.",
    );
  }

  await setupMockItems();

  await rag("What running shoes do you have?");
  await rag("I need comfortable shoes for everyday use");
  await rag("Do you have any wireless audio products?");

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
}

async function retrieve(query: string, topK = 5): Promise<RetrievedItem[]> {
  return db
    .select({
      id: mockItems.id,
      description: mockItems.description,
      category: mockItems.category,
      rating: mockItems.rating,
      inStock: mockItems.inStock,
      createdAt: mockItems.createdAt,
      metadata: mockItems.metadata,
      score: search.score(mockItems.id),
    })
    .from(mockItems)
    .where(search.parse(mockItems.id, query, { lenient: true }))
    .orderBy(desc(search.score(mockItems.id)))
    .limit(topK);
}

function formatContext(items: RetrievedItem[]): string {
  if (items.length === 0) return "No products found.";

  return items
    .map((item) => {
      const stock = item.inStock ? "In Stock" : "Out of Stock";
      const color = item.metadata?.color ?? "N/A";
      return `- ${item.description} | Category: ${item.category} | Rating: ${item.rating}/5 | ${stock} | Color: ${color}`;
    })
    .join("\n");
}

async function generate(query: string, context: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "(Set OPENROUTER_API_KEY to enable generation.)";

  const prompt = `You are a helpful product assistant. Answer the customer's question based only on the product information provided below.

Product Catalog:
${context}

Customer Question: ${query}

Provide a helpful, concise answer. If the products don't match what the customer is looking for, say so.`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
        }),
      },
    );
    if (!response.ok) {
      return `(OpenRouter error: ${response.status} ${response.statusText})`;
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return (
      body.choices?.[0]?.message?.content ?? "(OpenRouter returned no answer.)"
    );
  } catch (error) {
    return `(OpenRouter error: ${String(error)})`;
  }
}

async function rag(query: string): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log(`Question: ${query}`);
  console.log("=".repeat(60));

  const items = await retrieve(query);
  console.log(`\nRetrieved ${items.length} products:`);
  for (const item of items) {
    console.log(`  - ${item.description} (score: ${item.score.toFixed(2)})`);
  }

  console.log("\nAnswer:");
  console.log("-".repeat(40));
  console.log(await generate(query, formatContext(items)));
}

try {
  await runRag();
} finally {
  await closeDb();
}
