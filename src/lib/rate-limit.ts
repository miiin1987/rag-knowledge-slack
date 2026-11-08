import "server-only";

// ──────────────────────────────────────────────────────────────
// 分散レート制限（rag-knowledge-slack 専用）
//
// Work02（rag-search）と同一Redisインスタンスを共有するため、
// すべてのキーに "-rag7" サフィックスを付けて完全分離する。
//
// キー設計:
//   IP制限  : prefix "rl:chat-rag7"  ← Work02 "rl:chat" と衝突しない
//   日次制限 : "rl:daily-rag7:YYYY-MM-DD" ← Work02 "rl:daily:YYYY-MM-DD" と衝突しない
//
// Upstash 無料枠: 10,000 コマンド/日
// ──────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** レート制限リセットまでの秒数（超過時のみ意味を持つ） */
  retryAfterSec: number;
}

const WINDOW_SEC   = 60;
const MAX_REQUESTS = 10;   // 10 リクエスト / 60 秒 / IP
const DAILY_MAX    = 150;  // 日次グローバル上限（Work02 とは独立カウント）

// ── Upstash 分散レート制限（IP単位） ─────────────────────────────

async function tryUpstashLimit(identifier: string): Promise<RateLimitResult | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const { Ratelimit } = await import("@upstash/ratelimit");
    const { Redis }     = await import("@upstash/redis");

    const ratelimit = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.fixedWindow(MAX_REQUESTS, `${WINDOW_SEC} s`),
      analytics: false,
      prefix: "rl:chat-rag7",   // Work02 の "rl:chat" と衝突しないプレフィックス
    });

    const result = await ratelimit.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      retryAfterSec: result.success ? 0 : Math.ceil((result.reset - Date.now()) / 1000),
    };
  } catch (err) {
    console.error(
      "[rate-limit-rag7] Upstash 接続失敗 → インメモリにフォールバック:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ── インメモリフォールバック（ローカル開発専用） ──────────────

type MemEntry = { count: number; resetAt: number };
const memStore = new Map<string, MemEntry>();

function memLimit(identifier: string): RateLimitResult {
  const now   = Date.now();
  const entry = memStore.get(identifier);

  if (!entry || now >= entry.resetAt) {
    memStore.set(identifier, { count: 1, resetAt: now + WINDOW_SEC * 1000 });
    return { success: true, limit: MAX_REQUESTS, remaining: MAX_REQUESTS - 1, retryAfterSec: 0 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return {
      success: false, limit: MAX_REQUESTS, remaining: 0,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return {
    success: true, limit: MAX_REQUESTS,
    remaining: MAX_REQUESTS - entry.count, retryAfterSec: 0,
  };
}

function pruneMemStore(): void {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (now >= entry.resetAt) memStore.delete(key);
  }
}

// ── 日次グローバル上限（Work02 と独立した rag7 専用カウンター） ──

export interface DailyLimitResult {
  allowed: boolean;
  remaining: number | null;
}

/**
 * Redis の INCR コマンドはアトミックなため、
 * 同時リクエストが発生しても正確に 1 ずつカウントされ、
 * DAILY_MAX を超えることはない。
 */
export async function checkDailyLimit(): Promise<DailyLimitResult> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { allowed: true, remaining: null };

  try {
    const { Redis } = await import("@upstash/redis");
    const redis     = new Redis({ url, token });

    // JST 基準の日付キー（Work02 "rl:daily:YYYY-MM-DD" とは別キー）
    const jst     = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dateKey = jst.toISOString().slice(0, 10);
    const key     = `rl:daily-rag7:${dateKey}`;

    const count = await redis.incr(key);  // アトミックインクリメント
    if (count === 1) {
      await redis.expire(key, 48 * 60 * 60);  // 48時間で自動削除
    }

    return {
      allowed:   count <= DAILY_MAX,
      remaining: Math.max(0, DAILY_MAX - count),
    };
  } catch (err) {
    console.error("[rate-limit-rag7] 日次制限チェック失敗 → 許可扱い:", err instanceof Error ? err.message : String(err));
    return { allowed: true, remaining: null };
  }
}

// ── 公開 API ──────────────────────────────────────────────────

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  pruneMemStore();
  return (await tryUpstashLimit(ip)) ?? memLimit(ip);
}
