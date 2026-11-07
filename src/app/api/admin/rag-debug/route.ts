import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateQueryEmbedding } from "@/lib/embeddings";
import { verifyAdminToken, unauthorizedResponse } from "@/lib/admin-auth";

const QUERY = "所定労働時間は1日何時間ですか？";

export async function GET(request: Request) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  const steps: Record<string, unknown> = {};

  // Step 1: documents
  {
    const { data, error } = await supabase
      .from("documents")
      .select("id, original_name, page_count, created_at")
      .order("created_at", { ascending: false });
    steps.step1_documents = error
      ? { ok: false, error: error.message }
      : { ok: true, count: data?.length ?? 0, rows: data };
  }

  // Step 2: chunks (NULL確認含む)
  {
    const { count: total } = await supabase
      .from("chunks")
      .select("*", { count: "exact", head: true });
    const { count: nullCount } = await supabase
      .from("chunks")
      .select("*", { count: "exact", head: true })
      .is("embedding", null);
    const { data: sample } = await supabase
      .from("chunks")
      .select("id, content, page_number, embedding")
      .limit(1)
      .maybeSingle();

    steps.step2_chunks = {
      ok: (total ?? 0) > 0,
      total_chunks: total,
      null_embeddings: nullCount,
      non_null_embeddings: (total ?? 0) - (nullCount ?? 0),
      embedding_type: typeof sample?.embedding,
      embedding_is_null: sample?.embedding === null,
      embedding_preview: sample?.embedding
        ? String(sample.embedding).slice(0, 50) + "..."
        : null,
      content_preview: sample?.content?.slice(0, 80),
    };
  }

  // Step 3: クエリ Embedding 生成
  let queryEmbedding: number[] | null = null;
  {
    try {
      queryEmbedding = await generateQueryEmbedding(QUERY);
      steps.step3_query_embedding = {
        ok: true,
        dimension: queryEmbedding.length,
        norm: +Math.sqrt(queryEmbedding.reduce((s, v) => s + v * v, 0)).toFixed(4),
      };
    } catch (e) {
      steps.step3_query_embedding = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Step 4: ベクトル検索（閾値0 ← 全件ヒットするはず）
  if (queryEmbedding) {
    const { data, error } = await supabase.rpc("search_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0,
      match_count: 10,
    });
    steps.step4_search_threshold0 = error
      ? { ok: false, error: error.message }
      : {
          ok: true,
          count: data?.length ?? 0,
          diagnosis:
            (data?.length ?? 0) === 0
              ? "⚠️ 閾値0でも0件 → インデックスの問題（fix-index.sqlを実行してください）"
              : "✅ 正常",
          results: (data ?? []).slice(0, 5).map(
            (r: { original_name: string; page_number: number; similarity: number; content: string }) => ({
              similarity: +Number(r.similarity).toFixed(4),
              original_name: r.original_name,
              page: r.page_number,
              content_preview: r.content?.slice(0, 60),
            })
          ),
        };
  }

  // Step 5: ベクトル検索（閾値0.3 ← 通常設定）
  if (queryEmbedding) {
    const { data, error } = await supabase.rpc("search_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5,
    });
    steps.step5_search_threshold03 = error
      ? { ok: false, error: error.message }
      : {
          ok: true,
          count: data?.length ?? 0,
          note: (data?.length ?? 0) > 0 ? "✅ 検索成功" : "❌ 結果なし（Step4の問題が原因）",
          results: (data ?? []).slice(0, 3).map(
            (r: { original_name: string; page_number: number; similarity: number; content: string }) => ({
              similarity: +Number(r.similarity).toFixed(4),
              original_name: r.original_name,
              content_preview: r.content?.slice(0, 60),
            })
          ),
        };
  }

  console.log("[rag-debug]", JSON.stringify(steps, null, 2));

  const needsIndexFix =
    queryEmbedding !== null &&
    (steps.step4_search_threshold0 as { count?: number })?.count === 0;

  return NextResponse.json({
    query: QUERY,
    needs_fix: needsIndexFix,
    fix_instruction: needsIndexFix
      ? "supabase/fix-index.sql を Supabase SQL Editor で実行してください"
      : null,
    steps,
  });
}
