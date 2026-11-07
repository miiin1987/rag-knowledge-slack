-- ============================================================
-- インデックス修正スクリプト
-- Supabase SQL Editor でこのファイルの内容を実行してください
--
-- 【問題】
--   ivfflat インデックスが空テーブルに作成されたため壊れています。
--   ivfflat は作成時にデータが必要であり、空テーブルでは
--   後からデータを挿入しても正しく検索できません。
--
-- 【修正】
--   ivfflat を削除し、HNSW インデックスに置き換えます。
--   HNSW はデータが少なくても正確に動作し、自動更新されます。
-- ============================================================

-- 1. 壊れた ivfflat インデックスを削除
DROP INDEX IF EXISTS chunks_embedding_idx;

-- 2. HNSW インデックスを作成（既存データも含めて正しくインデックス化される）
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. search_chunks 関数を HNSW 対応に更新
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.3,
  match_count     INT   DEFAULT 5
)
RETURNS TABLE (
  chunk_id      UUID,
  document_id   UUID,
  content       TEXT,
  page_number   INT,
  similarity    FLOAT,
  original_name TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY
  SELECT
    c.id              AS chunk_id,
    c.document_id,
    c.content,
    c.page_number,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity,
    d.original_name
  FROM chunks c
  JOIN documents d ON c.document_id = d.id
  WHERE (1 - (c.embedding <=> query_embedding)) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 4. 動作確認クエリ（修正後に実行して結果を確認）
-- ↓ 以下を実行してヒット件数を確認してください
SELECT count(*) AS total_chunks FROM chunks;
SELECT id, left(content, 50) AS preview FROM chunks LIMIT 5;
