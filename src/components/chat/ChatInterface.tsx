"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageList } from "./MessageList";
import { useStreamingChat } from "@/lib/use-streaming-chat";

export function ChatInterface() {
  const { messages, input, setInput, sendMessage, isLoading, error } =
    useStreamingChat();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [sendMessage, input]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [sendMessage, input]
  );

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} isLoading={isLoading} />

      {error && (
        <p className="text-sm text-destructive text-center py-2">{error}</p>
      )}

      <div className="border-t pt-4">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="社内文書について質問してください… (Enter で送信、Shift+Enter で改行)"
            className="flex-1 resize-none min-h-[52px] max-h-[160px]"
            rows={1}
            disabled={isLoading}
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="shrink-0"
          >
            送信
          </Button>
        </form>
      </div>
    </div>
  );
}
