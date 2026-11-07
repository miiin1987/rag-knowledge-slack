"use client";

import { useState, useCallback, useRef } from "react";
import type { Source } from "@/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

export function useStreamingChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // messages 更新を ref にも反映して sendMessage クロージャから参照できるようにする
  const updateMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (userContent: string) => {
      if (!userContent.trim() || isLoading) return;

      setError(null);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userContent,
      };

      // React の setState は非同期のため、更新キュー登録より前に現在の値を確定しておく。
      // こうすることで historyMessages に userMsg を確実に含められる。
      const previousMessages = messagesRef.current;

      updateMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      const assistantId = crypto.randomUUID();

      try {
        // previousMessages（今送る前の履歴） + userMsg = 完全な会話履歴
        const historyMessages = [...previousMessages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyMessages }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "サーバーエラーが発生しました");
        }

        // ソース情報をレスポンスヘッダーから取得（base64エンコード済み）
        // atob() は Latin-1 バイト列として返すため TextDecoder で UTF-8 解釈する
        const sourcesHeader = response.headers.get("X-Sources");
        const sources: Source[] = sourcesHeader
          ? (() => {
              const bytes = Uint8Array.from(atob(sourcesHeader), (c) => c.charCodeAt(0));
              return JSON.parse(new TextDecoder().decode(bytes)) as Source[];
            })()
          : [];

        // アシスタントメッセージを追加（sources はストリーミング完了後に確定するため空で開始）
        updateMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "", sources: [] },
        ]);

        // ストリームを読み込んでコンテンツを逐次更新
        const reader = response.body?.getReader();
        if (!reader) throw new Error("ストリームの読み取りに失敗しました");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m
            )
          );
        }

        // デコーダーをフラッシュして完全なテキストを確定
        accumulated += decoder.decode();

        // 回答内容に基づいて出典を確定する。
        // 「該当情報が見つかりません」を含む場合、AIが参考文書を使えなかったことを示すため
        // 検索でヒットしたチャンクは出典として表示しない。
        const finalSources = accumulated.includes("該当情報が見つかりません") ? [] : sources;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: accumulated, sources: finalSources }
              : m
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
        // 失敗したアシスタントメッセージを削除
        updateMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, updateMessages]
  );

  return {
    messages,
    input,
    setInput,
    sendMessage,
    isLoading,
    error,
  };
}
