-- ============================================================
-- rag7 スキーマ インデックス修正スクリプト
-- Supabase SQL Editor でこのファイルの内容を実行してください
--
-- 【問題】
--   rag7.chunks の HNSW インデックスが壊れているか
--   存在しない場合に実行してください。
--
-- 【修正内容】
--   既存インデックスを削除し HNSW インデックスを再作成します。
--   rag7.search_chunks() 関数も最新版に更新します。
-- ============================================================

-- 1. 既存インデックスを削除（存在しない場合は何もしない）
DROP INDEX IF EXISTS rag7_chunks_embedding_hnsw_idx;
DROP INDEX IF EXISTS rag7_chunks_embedding_idx;

-- 2. HNSW インデックスを再作成
CREATE INDEX rag7_chunks_embedding_hnsw_idx
  ON rag7.chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. rag7.search_chunks 関数を最新版に更新
CREATE OR REPLACE FUNCTION rag7.search_chunks(
  query_embedding  VECTOR(1536),
  match_threshold  FLOAT  DEFAULT 0.3,
  match_count      INT    DEFAULT 5,
  p_department     TEXT   DEFAULT NULL
)
RETURNS TABLE (
  chunk_id      UUID,
  document_id   UUID,
  content       TEXT,
  page_number   INT,
  similarity    FLOAT,
  original_name TEXT,
  department    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rag7, pg_catalog
AS $$
BEGIN
  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.page_number,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity,
    d.original_name,
    d.department
  FROM rag7.chunks c
  JOIN rag7.documents d ON c.document_id = d.id
  WHERE (1 - (c.embedding <=> query_embedding)) > match_threshold
    AND (
      (p_department IS NULL     AND d.department = 'all')
      OR
      (p_department IS NOT NULL AND d.department IN (p_department, 'all'))
    )
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 4. 動作確認クエリ（修正後に実行して結果を確認）
SELECT count(*) AS total_chunks FROM rag7.chunks;
SELECT id, left(content, 50) AS preview FROM rag7.chunks LIMIT 5;
