import { openai } from "@ai-sdk/openai";
import { streamText, createTextStreamResponse } from "ai";
import { buildRagContext, SYSTEM_PROMPT } from "@/lib/rag";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

/** 1 メッセージあたりの文字数上限（コスト・DoS 対策） */
const MAX_MESSAGE_LENGTH = 500;
/** 送信する会話履歴の最大ターン数（user + assistant ペア） */
const MAX_HISTORY_TURNS = 5;
/** AI 出力トークン上限（gpt-4o-mini: 1トークン ≒ 1.5文字） */
const MAX_OUTPUT_TOKENS = 600;

export async function POST(request: Request) {
  // ── 1. 分散レート制限 ──────────────────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { success, retryAfterSec } = await checkRateLimit(ip);
  if (!success) {
    return new Response(
      JSON.stringify({
        error: "リクエストが多すぎます。しばらく待ってから再度お試しください。",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSec),
        },
      }
    );
  }

  // ── 2. リクエスト検証 ──────────────────────────────────────
  const body = await request.json().catch(() => null);
  if (!body?.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "リクエスト形式が不正です" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages } = body as { messages: unknown[] };

  if (messages.length > 50) {
    return new Response(JSON.stringify({ error: "メッセージ数が多すぎます" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validMessages = messages.filter(
    (m): m is { role: "user" | "assistant"; content: string } => {
      if (typeof m !== "object" || m === null) return false;
      const msg = m as Record<string, unknown>;
      return (
        (msg.role === "user" || msg.role === "assistant") &&
        typeof msg.content === "string"
      );
    }
  );

  const lastUserMessage = validMessages.findLast((m) => m.role === "user");

  if (!lastUserMessage?.content) {
    return new Response(JSON.stringify({ error: "質問が空です" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (lastUserMessage.content.length > MAX_MESSAGE_LENGTH) {
    return new Response(
      JSON.stringify({
        error: `質問は${MAX_MESSAGE_LENGTH}文字以内で入力してください。`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── 3. 会話履歴のサイズ制限（トークン・コスト抑制） ──────────
  const trimmedHistory = validMessages
    .filter((m) => typeof m.content === "string")
    .slice(-(MAX_HISTORY_TURNS * 2 + 1));

  // ── 4. RAG コンテキスト構築 ────────────────────────────────
  try {
    const { contextText, sources, hasResults } = await buildRagContext(
      lastUserMessage.content
    );

    const contextSection = hasResults
      ? `【参考文書】\n${contextText}`
      : "【参考文書】\n（該当する文書が見つかりませんでした）";

    // ── 5. AI 回答生成（コスト制限付き） ───────────────────────
    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      messages: [
        ...trimmedHistory.slice(0, -1),
        {
          role: "user",
          content: `${contextSection}\n\n【質問】\n${lastUserMessage.content}`,
        },
      ],
      maxOutputTokens: MAX_OUTPUT_TOKENS, // 出力トークン上限でコストを制御
      temperature: 0,               // 決定論的出力（RAG に適切）
    });

    return createTextStreamResponse({
      stream: result.textStream,
      headers: {
        "Cache-Control": "no-cache",
        // 日本語ファイル名が含まれる可能性があるためbase64エンコード
        "X-Sources": Buffer.from(JSON.stringify(sources)).toString("base64"),
      },
    });
  } catch (err) {
    console.error("[chat] エラー:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "AIサービスに問題が発生しました" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
