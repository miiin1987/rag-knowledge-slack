import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { buildRagContext, SYSTEM_PROMPT } from "@/lib/rag";
import type { Source } from "@/types";

// ── 型定義 ────────────────────────────────────────────────────

export interface SlackEventPayload {
  type: string;
  challenge?: string;
  event_id?: string;
  event?: SlackMentionEvent;
}

export interface SlackMentionEvent {
  type: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
  user?: string;
}

// ── 署名検証 ─────────────────────────────────────────────────

/**
 * Slack リクエストの HMAC-SHA256 署名を検証する。
 * - タイムスタンプが 5 分以上古い場合はリプレイアタックとして拒否
 * - timingSafeEqual でタイミング攻撃を防止
 */
export function verifySlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const computed = `v0=${createHmac("sha256", signingSecret).update(sigBase).digest("hex")}`;

  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── 重複排除 ──────────────────────────────────────────────────

/**
 * イベント ID を Upstash Redis に記録して重複処理を防ぐ。
 * SET NX EX 600 で原子的にセット: 新規なら true、既存なら false を返す。
 * Redis 未設定時は重複チェックなしで true を返す（開発環境対応）。
 */
export async function markEventProcessed(eventId: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true;

  try {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url, token });
    const result = await redis.set(`slack:event:${eventId}`, "1", {
      nx: true,
      ex: 600,
    });
    // SET NX: "OK" = 新規セット成功（処理すべき）, null = 既に存在（スキップ）
    return result !== null;
  } catch {
    return true;
  }
}

// ── Slack メッセージ送信 ──────────────────────────────────────

export async function postSlackMessage(
  channel: string,
  text: string,
  threadTs: string
): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text, thread_ts: threadTs }),
  });

  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}

// ── RAG + AI 回答生成 ─────────────────────────────────────────

function buildSourcesText(sources: Source[]): string {
  if (sources.length === 0) return "";
  const lines = sources.map(
    (s) =>
      `• ${s.original_name}（p.${s.page_number}、類似度 ${(s.similarity * 100).toFixed(0)}%）`
  );
  return `\n\n*出典:*\n${lines.join("\n")}`;
}

export async function handleAppMention(event: SlackMentionEvent): Promise<void> {
  const channel = event.channel;
  const ts = event.ts;
  if (!channel || !ts) return;

  const threadTs = event.thread_ts ?? ts;

  // メンション文字列 <@BOTID> を除去して質問テキストを取得
  const question = (event.text ?? "").replace(/<@[A-Z0-9]+>\s*/g, "").trim();
  if (!question) return;

  const { contextText, sources, hasResults } = await buildRagContext(question);

  const contextSection = hasResults
    ? `【参考文書】\n${contextText}`
    : "【参考文書】\n（該当する文書が見つかりませんでした）";

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${contextSection}\n\n【質問】\n${question}`,
      },
    ],
    maxOutputTokens: 600,
    temperature: 0,
  });

  const sourcesText = buildSourcesText(
    text.includes("該当情報が見つかりません") ? [] : sources
  );
  await postSlackMessage(channel, text + sourcesText, threadTs);
}
