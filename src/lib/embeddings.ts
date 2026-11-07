import "server-only";
import { openai } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";

const EMBEDDING_MODEL = openai.embedding("text-embedding-3-small");
const BATCH_SIZE = 100; // OpenAI APIの1回のリクエスト上限

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: batch,
    });
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
  });
  return embedding;
}
