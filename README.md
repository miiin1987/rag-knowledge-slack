# 社内文書検索 AI（RAG システム）

PDF をアップロードして社内文書の内容を AI に質問できる、**検索拡張生成（RAG）** デモアプリです。  
ポートフォリオ用途で作成しており、実際の企業情報は含まれていません。

## 機能

| 機能 | 詳細 |
|------|------|
| PDF アップロード | 日本語 PDF を含む任意の PDF を管理画面からアップロード |
| テキスト抽出 | pdfjs-dist による高精度な日本語テキスト抽出（CIDFont / UniJIS 対応） |
| ベクトルインデックス | OpenAI `text-embedding-3-small` でチャンク単位にベクトル化 |
| 意味検索 | Supabase pgvector (HNSW) によるコサイン類似度検索 |
| AI 回答生成 | `gpt-4o-mini` でソース引用付きのストリーミング回答 |
| ソース表示 | 回答根拠となった文書名とページ番号をチャット UI に表示 |
| レート制限 | Upstash Redis による IP ベース制限（10 req / 60 秒） |
| 管理画面 | 文書の一覧・追加・削除（パスワード認証） |

## 技術構成

| カテゴリ | 採用技術 |
|----------|---------|
| フレームワーク | Next.js 16 (App Router) / React 19 / TypeScript |
| AI SDK | Vercel AI SDK v7 (`ai`, `@ai-sdk/openai`) |
| LLM / Embeddings | OpenAI gpt-4o-mini / text-embedding-3-small |
| ベクトル DB | Supabase PostgreSQL + pgvector (HNSW インデックス) |
| PDF 解析 | pdfjs-dist v6（カスタム CMap ローダーで日本語対応） |
| レート制限 | Upstash Redis (`@upstash/ratelimit`) |
| スタイリング | Tailwind CSS v4 + shadcn/ui |
| デプロイ | Vercel |

## アーキテクチャ

```
[ ユーザー ] ─チャット質問─▶ /api/chat
                                │
                        クエリをベクトル変換
                      (OpenAI text-embedding-3-small)
                                │
                        pgvector で類似チャンク検索
                      (Supabase HNSW, コサイン類似度)
                                │
                        RAG プロンプト組み立て
                      (参考文書 + ユーザー質問)
                                │
                        gpt-4o-mini でストリーミング生成
                                │
                     ◀─回答テキスト + X-Sources ヘッダー─

[ 管理者 ] ─PDF アップロード─▶ /api/admin/upload
                                │
                        テキスト抽出 (pdfjs-dist)
                                │
                        チャンク分割 (500 文字 / オーバーラップ 100)
                                │
                        Embedding 生成 (バッチ処理)
                                │
                        Supabase に保存 (documents + chunks)
```

## セットアップ

### 1. リポジトリのクローン・依存パッケージのインストール

```bash
git clone <repo-url>
cd rag-search
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` を開いて以下を設定します。

| 変数名 | 説明 | 取得元 |
|--------|------|--------|
| `OPENAI_API_KEY` | OpenAI API キー | [platform.openai.com](https://platform.openai.com/api-keys) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | Supabase ダッシュボード → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role キー（秘密鍵） | Supabase ダッシュボード → Settings → API |
| `ADMIN_SECRET` | 管理画面パスワード（任意の文字列） | 自分で設定 |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | [console.upstash.com](https://console.upstash.com) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis トークン | [console.upstash.com](https://console.upstash.com) |

> **Upstash Redis** は未設定でも動作します（プロセスメモリにフォールバック）。  
> Vercel 本番環境では Upstash の使用を推奨します（サーバーレス間でカウンターが共有されるため）。

### 3. Supabase のセットアップ

Supabase ダッシュボードの **SQL Editor** で `supabase/schema.sql` を実行します。  
pgvector 拡張の有効化・テーブル作成・HNSW インデックス・検索関数がすべて含まれています。

### 4. テスト PDF の生成（任意）

```bash
npm run generate-pdfs
```

架空の社内文書 PDF（就業規則・経費規程・IT ガイドライン等）を `test-pdfs/` に生成します。  
日本語フォント（`scripts/fonts/NotoSansJP-Regular.ttf`）または Windows 標準フォントが自動検出されます。  
→ フォントがない場合は `npm run generate-pdfs:ascii` で ASCII モード生成も可能です。

## 起動方法

### 開発サーバー

```bash
npm run dev
```

| URL | 内容 |
|-----|------|
| `http://localhost:3000` | チャット UI |
| `http://localhost:3000/admin` | 管理画面（PDF アップロード・削除） |

### 本番ビルド

```bash
npm run build
npm run start
```

## ディレクトリ構成

```
rag-search/
├── src/
│   ├── app/
│   │   ├── page.tsx              # チャット UI ルート
│   │   ├── admin/page.tsx        # 管理画面
│   │   └── api/
│   │       ├── chat/route.ts     # RAG チャット API
│   │       └── admin/
│   │           ├── upload/       # PDF アップロード
│   │           ├── documents/    # 文書一覧・削除
│   │           ├── health/       # ヘルスチェック
│   │           └── rag-debug/    # RAG デバッグ
│   ├── lib/
│   │   ├── pdf-processor.ts      # PDF テキスト抽出（pdfjs-dist v6）
│   │   ├── embeddings.ts         # OpenAI Embeddings
│   │   ├── vector-search.ts      # Supabase pgvector 検索
│   │   ├── rag.ts                # RAG コンテキスト構築
│   │   ├── rate-limit.ts         # Upstash Redis レート制限
│   │   ├── supabase.ts           # Supabase クライアント
│   │   ├── admin-auth.ts         # 管理 API 認証ヘルパー
│   │   └── use-streaming-chat.ts # ストリーミングチャットフック
│   ├── components/
│   │   ├── chat/                 # チャット UI コンポーネント
│   │   └── admin/                # 管理画面コンポーネント
│   └── types/index.ts
├── supabase/
│   ├── schema.sql                # DB スキーマ（初回セットアップ用）
│   └── fix-index.sql             # HNSW インデックス修正スクリプト
├── scripts/
│   ├── generate-test-pdfs.mjs     # テスト PDF 生成
│   ├── verify-extraction.mjs      # PDF 抽出検証
│   ├── test-upstash-ratelimit.mjs  # Upstash 動作確認
│   ├── test-japanese-extract.mjs  # 日本語抽出デバッグ
│   └── fonts/README.md            # 日本語フォントの入手方法
└── .env.example                  # 環境変数テンプレート
```

## Vercel へのデプロイ

1. Vercel にリポジトリを連携
2. Environment Variables に `.env.local` の内容を設定
3. デプロイ

> `serverExternalPackages: ["pdf-parse", "pdfjs-dist"]` が `next.config.ts` に設定済みのため、  
> PDF 解析ライブラリは Vercel Function 上でも正常に動作します。

## 技術的なポイント

### 日本語 PDF の CMap 問題と解決策

ReportLab・Microsoft Word 等で生成された日本語 PDF は **CIDFont（UniJIS-UCS2-H）** を使用します。  
pdfjs-dist の標準 `NodeBinaryDataFactory` は CMap ファイルを `fs.readFile("file://...")` に URL 文字列で渡すため、Node.js が解釈できず抽出が失敗します。

`src/lib/pdf-processor.ts` では `fileURLToPath()` で正しくパス変換するカスタム `NodeFsBinaryDataFactory` を実装し、この問題を解決しています。

### pdfjs-dist による ArrayBuffer の detach

pdfjs-dist は PDF データをワーカースレッドへ **Transferable** として転送するため、転送後は元の `ArrayBuffer` が detach されて `byteLength` が 0 になります。  
そのため `upload/route.ts` では `extractTextFromPdf()` を呼ぶ**前に**ファイルサイズを保存しています。

```typescript
const fileSize = buffer.byteLength;          // detach される前に保存
const { pages, pageCount } = await extractTextFromPdf(buffer);
// ...
file_size: fileSize,                         // 保存した値を使用
```

### ストリーミング + ソース情報の伝達

AI SDK v7 では `createTextStreamResponse()` でプレーンテキストストリームを返します。  
ソース情報（文書名・ページ番号・類似度）は **UTF-8 → Base64** で `X-Sources` ヘッダーに格納し、日本語ファイル名による HTTP ByteString エラーを回避しています。

クライアント側では `atob()` が Latin-1 バイト列を返すため、`TextDecoder` で UTF-8 として再解釈します。

```typescript
// NG: atob() のみだと日本語が文字化けする
JSON.parse(atob(sourcesHeader))

// OK: Uint8Array → TextDecoder で正しく UTF-8 デコード
const bytes = Uint8Array.from(atob(sourcesHeader), (c) => c.charCodeAt(0));
JSON.parse(new TextDecoder().decode(bytes))
```

## 注意事項

- 本リポジトリに含まれるサンプル PDF（`test-pdfs/`）は**すべて架空の企業・規程**です
- OpenAI API・Supabase・Upstash の利用には費用が発生する場合があります
- `SUPABASE_SERVICE_ROLE_KEY` は強力な権限を持つため、`.env.local` を絶対に公開しないでください
