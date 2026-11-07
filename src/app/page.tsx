import { ChatInterface } from "@/components/chat/ChatInterface";

export default function Home() {
  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto px-4">
      <header className="py-4 border-b shrink-0">
        <h1 className="text-lg font-semibold">社内文書検索AI</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          登録済みの社内文書から関連情報を検索して回答します
        </p>
      </header>
      <main className="flex-1 overflow-hidden py-4">
        <ChatInterface />
      </main>
    </div>
  );
}
