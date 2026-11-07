import { after } from "next/server";
import {
  verifySlackSignature,
  markEventProcessed,
  postSlackMessage,
  handleAppMention,
  type SlackEventPayload,
} from "@/lib/slack";

// RAG + LLM 処理に最大 60 秒確保（after() のコールバック実行時間を含む）
export const maxDuration = 60;

export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[slack] SLACK_SIGNING_SECRET is not set");
    return new Response("Server configuration error", { status: 500 });
  }

  // ── 1. 署名検証 ────────────────────────────────────────────
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackSignature(rawBody, timestamp, signature, signingSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  // ── 2. ペイロード解析 ───────────────────────────────────────
  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(rawBody) as SlackEventPayload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // ── 3. URL verification（Slack App 設定時の初回確認） ────────
  if (payload.type === "url_verification") {
    return Response.json({ challenge: payload.challenge });
  }

  if (payload.type !== "event_callback" || !payload.event) {
    return new Response("ok", { status: 200 });
  }

  const event = payload.event;

  // ── 4. Bot 自身のイベントをスキップ ────────────────────────
  if (event.bot_id || event.subtype === "bot_message") {
    return new Response("ok", { status: 200 });
  }

  // ── 5. app_mention のみ処理 ─────────────────────────────────
  if (event.type !== "app_mention") {
    return new Response("ok", { status: 200 });
  }

  // ── 6. 重複排除（Slack 再送対策） ───────────────────────────
  const eventId = payload.event_id ?? `${event.channel}:${event.ts}`;
  const shouldProcess = await markEventProcessed(eventId);
  if (!shouldProcess) {
    return new Response("ok", { status: 200 });
  }

  // ── 7. レスポンス送信後に非同期で RAG 処理を実行 ────────────
  // after() はレスポンス送信後もコールバックが完了するまで
  // Vercel Function のインスタンスを維持することを保証する。
  after(async () => {
    const channel = event.channel ?? "";
    const threadTs = event.thread_ts ?? event.ts ?? "";
    try {
      await handleAppMention(event);
    } catch (err) {
      console.error("[slack] handleAppMention failed:", err instanceof Error ? err.message : err);
      if (channel && threadTs) {
        try {
          await postSlackMessage(
            channel,
            "申し訳ありません。回答の生成中にエラーが発生しました。",
            threadTs
          );
        } catch {
          // Slack 通知失敗は無視
        }
      }
    }
  });

  return new Response("ok", { status: 200 });
}
