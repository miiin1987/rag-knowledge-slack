# RAG ナレッジ検索 ＋ Slack Bot

PDF・DOCX をアップロードして社内文書の内容を AI に質問できる **RAG（検索拡張生成）** システムです。  
Web チャット UI に加え、Slack の `@mention` から同じナレッジベースを検索できる Slack Bot も実装しています。  
ポートフォリオ用途で作成しており、実際の企業情報は含まれていません。

## 主な機能

| 機能 | 詳細 |
|------|------|
| ドキュメントアップロード | PDF・DOCX を管理画面からアップロード（日本語対応） |
| ベクトルインデックス | OpenAI `text-embedding-3-small` でチャンク単位にベクトル化し Supabase に保存 |
| 意味検索 | Supabase pgvector (HNSW) によるコサイン類似度検索 |
| AI 回答生成 | `gpt-4o-mini` でソース引用付きのストリーミング回答を生成 |
| ソース表示 | 回答の根拠となった文書名とページ番号をチャット UI に表示 |
| Slack Bot | `@mention` で質問すると RAG 検索結果をスレッドに返信 |
| レート制限 | Upstash Redis による IP ベース制限（10 req / 60 秒） |
| 管理画面 | 文書の一覧・追加・削除（パスワード認証） |

## 使用技術

| カテゴリ | 技術 |
|----------|------|
| フレームワーク | Next.js / React / TypeScript |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/openai`) |
| LLM / Embeddings | OpenAI gpt-4o-mini / text-embedding-3-small |
| ベクトル DB | Supabase PostgreSQL + pgvector |
| ドキュメント解析 | pdfjs-dist（日本語 PDF 対応）/ mammoth（DOCX） |
| レート制限 | Upstash Redis |
| UI | Tailwind CSS / shadcn/ui |
| デプロイ | Vercel |

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env.local` を作成し、各サービスの値を設定します。

```bash
cp .env.example .env.local
```

| 変数名 | 説明 | 取得先 |
|--------|------|--------|
| `OPENAI_API_KEY` | OpenAI API キー | [platform.openai.com](https://platform.openai.com/api-keys) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | Supabase ダッシュボード → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role キー | 同上 |
| `ADMIN_SECRET` | 管理画面パスワード（任意の文字列） | 自分で設定 |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis の REST URL | [console.upstash.com](https://console.upstash.com/) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis のトークン | 同上 |
| `SLACK_BOT_TOKEN` | Slack Bot OAuth トークン | Slack App → OAuth & Permissions |
| `SLACK_SIGNING_SECRET` | Slack 署名シークレット | Slack App → Basic Information |

### 3. Supabase スキーマの設定

Supabase の SQL Editor で以下を実行します。

```
supabase/schema_rag7.sql
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) でアクセスできます。

### 5. Slack Bot の設定

1. [api.slack.com](https://api.slack.com/apps) で Slack App を作成
2. **Event Subscriptions** を有効化し、Request URL に `https://your-app.vercel.app/api/slack/events` を設定
3. Bot Event に `app_mention` を追加
4. OAuth & Permissions で `chat:write`・`app_mentions:read` スコープを付与
5. ワークスペースにインストールし、Bot User OAuth Token を `.env.local` に設定

## 注意事項

- 掲載内容はポートフォリオ用途の自主制作です。実際の顧客への導入実績ではありません。
- アップロードするドキュメントに個人情報・機密情報を含めないでください。
