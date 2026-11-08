import { ChatInterface } from "@/components/chat/ChatInterface";

export default function Home() {
  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto px-4">
      {/* デモバナー */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-800 shrink-0">
        ⚠️ デモ版 ·{" "}
        <span className="font-semibold">架空会社「株式会社テクノリンク」</span>
        の社内規定サンプルを登録しています。実在の企業・個人情報は含まれていません。
      </div>

      <header className="py-4 border-b shrink-0">
        <h1 className="text-lg font-semibold">社内文書検索AI + Slack Bot</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          登録済みの社内文書から関連情報を検索して回答します
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground leading-6">登録文書：</span>
          {["就業規則", "在宅勤務規程", "社内IT利用規程", "採用・入社規程", "コミュニケーションガイド"].map((d) => (
            <span
              key={d}
              className="inline-block text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5"
            >
              {d}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          💬 Slack Bot機能：ワークスペースに追加後、{" "}
          <code className="bg-muted px-1 rounded text-xs">@mention</code>{" "}
          でこの文書を検索できます（Slackワークスペースの設定が別途必要）
        </p>
      </header>

      <main className="flex-1 overflow-hidden py-4">
        <ChatInterface />
      </main>
    </div>
  );
}
