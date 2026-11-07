import { supabase } from "@/lib/supabase";
import type { SearchResult } from "@/types";

const SIMILARITY_THRESHOLD = 0.3;
const MATCH_COUNT = 5;

export async function searchChunks(
  queryEmbedding: number[]
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc("search_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: SIMILARITY_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  if (error) {
    throw new Error(`ベクトル検索エラー: ${error.message}`);
  }

  return (data ?? []) as SearchResult[];
}
