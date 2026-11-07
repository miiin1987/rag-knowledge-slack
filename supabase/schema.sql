-- ============================================================
-- 社内文書検索AI (RAG) データベーススキーマ
-- Supabase の SQL Editor でこのファイルを実行してください
-- ============================================================

-- Step 1: pgvector 拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: documents テーブル（PDFメタデータ）
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,       -- ストレージ内ファイル名（UUID）
  original_name TEXT NOT NULL,       -- 元のファイル名（表示用）
  file_size     INTEGER NOT NULL,    -- バイト数
  page_count    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: chunks テーブル（テキストチャンク + ベクトル）
CREATE TABLE IF NOT EXISTS chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  page_number  INTEGER NOT NULL,
  chunk_index  INTEGER NOT NULL,
  embedding    VECTOR(1536),          -- text-embedding-3-small の次元数
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: ベクトル検索用インデックス（HNSW）
-- HNSW は ivfflat と異なりデータが少なくても正確に動作し、
-- INSERT のたびに自動更新されるため空テーブルへの事前作成が可能。
-- ivfflat は空テーブルに作成すると後からデータを挿入しても正しく検索できない。
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Step 5: RLS を有効化（Service Role Key でバイパス、安全対策として有効化）
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

-- Step 6: ベクトル類似度検索関数
-- ivfflat.probes を設定して小規模データでも確実にヒットするよう調整
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
  -- HNSW の探索幅を広げる（小規模データでの精度向上）
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
