-- ============================================================
-- 案件7 (rag-knowledge-slack) 専用スキーマ: rag7
--
-- 【前提】
--   案件3の public スキーマと Supabase プロジェクトを共有します。
--   このスクリプトは public スキーマを一切変更しません。
--
-- 【実行前に必要な Supabase ダッシュボード設定】
--   Settings → API → "Exposed schemas" に "rag7" を追加 → Save
--   ※ PostgREST が rag7 スキーマへのルーティングに必要
--
-- 【実行手順】
--   Supabase ダッシュボード → SQL Editor でこのファイルを実行
--
-- 【再実行時の挙動（冪等性）】
--   ◎ 安全（何度実行しても結果が同じ）:
--     - CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS
--         → 既存オブジェクトがあれば何もしない
--         → 存在しない場合のみ作成
--     - ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--         → 既に有効でもエラーにならない
--     - GRANT / REVOKE
--         → 既に付与済み / 未付与でもエラーにならない
--     - CREATE OR REPLACE FUNCTION
--         → 関数定義を最新版に更新する（既存の GRANT は保持される）
--
--   ⚠ 注意（再実行で変化する操作）:
--     - REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC
--         → 誰かが手動で PUBLIC に EXECUTE を付与していた場合、
--           再実行で取り消される（意図した動作）
--     - CREATE TABLE IF NOT EXISTS は「列の追加」を行わない
--         → テーブルが既に存在する場合、department 列の欠落など
--           スキーマ変更は ALTER TABLE で別途対応が必要
--
--   ✗ 変更しないもの:
--     - public スキーマのあらゆるオブジェクト（案件3のデータ含む）
-- ============================================================

-- ── 拡張（pgvector は案件3で有効化済みだが IF NOT EXISTS で安全） ───
CREATE EXTENSION IF NOT EXISTS vector;

-- ── スキーマ ────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS rag7;
COMMENT ON SCHEMA rag7 IS '案件7 (rag-knowledge-slack) 専用スキーマ。案件3の public スキーマとは完全に独立。';

-- ============================================================
-- テーブル定義
-- ============================================================

-- ── rag7.documents ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag7.documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT        NOT NULL,       -- ストレージ内 UUID ファイル名
  original_name TEXT        NOT NULL,       -- アップロード元のファイル名（表示用）
  file_size     INTEGER     NOT NULL,       -- バイト数
  page_count    INTEGER     NOT NULL,
  department    TEXT        NOT NULL DEFAULT 'all',
  --   'all'  : 全部署共通（部署を問わず検索対象）
  --   '営業部': 営業部専用（将来の部署フィルタで使用）
  --   Phase 1 では全文書を 'all' で登録する
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  rag7.documents            IS '案件7専用: アップロード文書のメタデータ';
COMMENT ON COLUMN rag7.documents.department IS '部署識別子。''all'' = 全部署共通文書。Phase 2 で部署別制御に使用。';

-- ── rag7.chunks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag7.chunks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID        NOT NULL REFERENCES rag7.documents(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  page_number  INTEGER     NOT NULL,
  chunk_index  INTEGER     NOT NULL,
  embedding    VECTOR(1536),               -- text-embedding-3-small の次元数
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE rag7.chunks IS '案件7専用: テキストチャンク + ベクトル埋め込み';

-- ── HNSW インデックス ────────────────────────────────────────────────
-- HNSW は ivfflat と異なり空テーブルでも正確に動作し、INSERT のたびに自動更新される
CREATE INDEX IF NOT EXISTS rag7_chunks_embedding_hnsw_idx
  ON rag7.chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- Row Level Security
-- ============================================================
-- ポリシーなし = service_role (bypassrls) 以外は DENY ALL
-- service_role はサーバーサイドのみで使用し、クライアントには渡さない。
-- 将来 Supabase Auth を導入する場合はここにポリシーを追加する。
-- ============================================================

ALTER TABLE rag7.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag7.chunks    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 権限設計
-- ============================================================
-- 【分離原則】
--   スキーマ分離 (rag7 schema) = 案件3との論理的な境界
--   権限制御 (GRANT/REVOKE)   = ロールベースのアクセス制限
--   これらは独立した保護レイヤーであり、両方を適用する。
-- ============================================================

-- ── テーブルへの PUBLIC 暗黙権限を取り消す ──────────────────────────
-- PostgreSQL では CREATE TABLE 後に PUBLIC への暗黙権限が発生する場合があるため
-- 明示的に取り消す（防御的姿勢）
REVOKE ALL ON rag7.documents FROM PUBLIC;
REVOKE ALL ON rag7.chunks    FROM PUBLIC;

-- ── anon ロール ──────────────────────────────────────────────────────
-- PostgREST が rag7 スキーマへルーティングするために USAGE が必要。
-- テーブルへの SELECT/INSERT 等は付与しない。
-- RLS ポリシーなし + テーブル権限なし = 完全遮断（二重防護）
GRANT USAGE ON SCHEMA rag7 TO anon;

-- ── authenticated ロール ─────────────────────────────────────────────
-- 将来 Supabase Auth 統合に備えてスキーマ USAGE のみ付与。
-- テーブル権限・関数 EXECUTE は付与しない。
-- ※ 関数 EXECUTE の付与については後述のセキュリティ注記を参照。
GRANT USAGE ON SCHEMA rag7 TO authenticated;

-- ── service_role ─────────────────────────────────────────────────────
-- サーバーサイド専用（Next.js API Routes から使用）。
-- Supabase では service_role は bypassrls 権限を持つが、
-- 明示的にも付与することで意図を明確にする。
-- ※ GRANT ALL ON ALL FUNCTIONS はここでは記述しない。
--   関数が存在しない状態での GRANT は no-op になるため、
--   各関数の定義直後に明示的な GRANT で付与する（後述）。
GRANT USAGE                 ON SCHEMA rag7 TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA rag7 TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rag7 TO service_role;

-- ============================================================
-- ベクトル類似度検索関数: rag7.search_chunks
-- ============================================================
-- 【部署アクセス制御ロジック】
--   p_department = NULL  → department='all' のドキュメントのみ返す
--                          （部署未指定時の安全なデフォルト: 全員共通文書のみ）
--   p_department = '営業部' → '営業部' + 'all' のドキュメントを返す
--                             （指定部署 + 全員共通）
--
-- 【p_department の偽装リスクと対策】
--   この関数は p_department をパラメータで受け取る設計のため、
--   EXECUTE 権限を持つロールは任意の部署名を渡すことができる。
--   これは p_department 自体の検証を「呼び出し元」に委ねていることを意味する。
--
--   ▶ 現在の呼び出し元は service_role（Next.js サーバーサイド）のみ。
--     クライアントからのリクエストは Next.js API を経由し、
--     サーバー側で部署情報を検証してから関数に渡す。
--     クライアントが直接 p_department を制御することはできない。
--
--   ▶ authenticated ロールへの EXECUTE 付与は禁止:
--     Supabase クライアントを直接使うユーザーが任意の部署名を渡せてしまうため
--     現在の設計では付与しない。
--     Phase 2 で Supabase Auth を導入する場合は、p_department パラメータを廃止し
--     関数内で auth.jwt() -> 'user_metadata' -> 'department' を読み取る方式に
--     再設計してから EXECUTE を付与すること。
--
-- 【SECURITY DEFINER の理由】
--   関数がテーブル（rag7.documents / rag7.chunks）に直接アクセスできるよう、
--   関数の所有者権限（postgres）で実行する。
--   SET search_path = rag7, pg_catalog でスキーマを固定し、
--   search_path インジェクションを防ぐ。
-- ============================================================
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
  -- HNSW の探索幅を広げる（小規模データでの精度向上）
  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY
  SELECT
    c.id              AS chunk_id,
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
      -- 部署未指定: 全員共通 'all' のみ返す（無指定での全件アクセス禁止）
      (p_department IS NULL     AND d.department = 'all')
      OR
      -- 部署指定: 指定部署 + 全員共通 'all' を返す
      (p_department IS NOT NULL AND d.department IN (p_department, 'all'))
    )
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── 関数への実行権限 ─────────────────────────────────────────────────
-- PostgreSQL は CREATE FUNCTION 時に PUBLIC へ EXECUTE を暗黙付与する。
-- これを取り消さないと anon / authenticated も関数を呼び出せてしまう。
-- まず PUBLIC から明示的に取り消し、次に service_role のみに付与する。

REVOKE EXECUTE ON FUNCTION rag7.search_chunks(VECTOR, FLOAT, INT, TEXT) FROM PUBLIC;

-- service_role のみ EXECUTE を付与（サーバーサイド専用）
-- ・anon        → 付与しない: 認証なしユーザーのアクセスを遮断
-- ・authenticated → 付与しない: p_department パラメータ方式では部署偽装が可能なため
--                   Phase 2 で auth.jwt() 読み取り方式に再設計後に付与すること
GRANT EXECUTE ON FUNCTION rag7.search_chunks(VECTOR, FLOAT, INT, TEXT) TO service_role;
