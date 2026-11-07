import { generateQueryEmbedding } from "@/lib/embeddings";
import { searchChunks } from "@/lib/vector-search";
import type { SearchResult, Source } from "@/types";

const NO_RESULT_MESSAGE =
  "該当情報が見つかりません。ご質問の内容は登録済み文書に含まれていない可能性があります。";

export const SYSTEM_PROMPT = `あなたは社内文書検索AIアシスタントです。
以下の「参考文書」の内容のみを根拠として、質問に日本語で簡潔に回答してください。

【厳守ルール】
- 参考文書に記載がない情報は「該当情報が見つかりません。」と回答する
- 推測・補完・一般知識による回答は禁止
- 回答には必ず参考にした文書のファイル名とページ番号を示す`;

export interface RagContext {
  contextText: string;
  sources: Source[];
  hasResults: boolean;
}

export async function buildRagContext(query: string): Promise<RagContext> {
  const queryEmbedding = await generateQueryEmbedding(query);
  const results = await searchChunks(queryEmbedding);

  if (results.length === 0) {
    return {
      contextText: "",
      sources: [],
      hasResults: false,
    };
  }

  const contextText = formatContext(results);
  const sources = deduplicateSources(results);

  return { contextText, sources, hasResults: true };
}

function formatContext(results: SearchResult[]): string {
  return results
    .map(
      (r, i) =>
        `【参考文書 ${i + 1}】${r.original_name} (p.${r.page_number})\n${r.content}`
    )
    .join("\n\n");
}

function deduplicateSources(results: SearchResult[]): Source[] {
  const seen = new Set<string>();
  return results
    .filter((r) => {
      const key = `${r.original_name}:${r.page_number}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      original_name: r.original_name,
      page_number: r.page_number,
      similarity: r.similarity,
    }));
}

export { NO_RESULT_MESSAGE };
