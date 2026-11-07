/**
 * Test 5: Upstash レート制限の動作確認
 *
 * - 制限 3 回 / 60 秒で動作を確認
 * - 1〜3 回目: 通過（success: true）
 * - 4 回目  : ブロック（success: false）
 * - 本番設定（rl:chat）とは別のプレフィックス（rl:test）を使用
 *
 * 実行: node --env-file=.env.local scripts/test-upstash-ratelimit.mjs
 */

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error("❌ UPSTASH_REDIS_REST_URL または UPSTASH_REDIS_REST_TOKEN が未設定です");
  console.error("  .env.local に設定されているか確認してください");
  process.exit(1);
}

console.log("=== Test 5: Upstash レート制限テスト ===\n");
console.log("URL  :", url);
console.log("Token:", token.slice(0, 20) + "...\n");

const redis = new Redis({ url, token });

// 本番（rl:chat）と分離するため専用プレフィックス使用
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(3, "60 s"),
  analytics: false,
  prefix: "rl:test",
});

// ユニークな識別子でテスト（既存カウンターと干渉しない）
const TEST_ID = `test-${Date.now()}`;

console.log(`テスト識別子: ${TEST_ID}`);
console.log("制限設定: 3 リクエスト / 60 秒\n");

const cases = [
  { n: 1, expectedSuccess: true,  label: "通過（制限内）" },
  { n: 2, expectedSuccess: true,  label: "通過（制限内）" },
  { n: 3, expectedSuccess: true,  label: "通過（制限到達）" },
  { n: 4, expectedSuccess: false, label: "ブロック（制限超過）" },
];

let passed = 0;
let failed = 0;

for (const { n, expectedSuccess, label } of cases) {
  const result = await ratelimit.limit(TEST_ID);
  const ok = result.success === expectedSuccess;

  const icon = ok ? "✅" : "❌";
  const actual = result.success ? "通過" : "ブロック";
  console.log(
    `${icon} リクエスト ${n}: ${actual} | remaining: ${result.remaining} | 期待: ${label}`
  );

  if (ok) {
    passed++;
  } else {
    console.error(`   → 予期しない結果: success=${result.success}, expected=${expectedSuccess}`);
    failed++;
  }
}

console.log(`\n結果: ${passed} 件成功, ${failed} 件失敗`);

if (failed > 0) {
  console.error("\n❌ Test 5 FAILED");
  process.exit(1);
} else {
  console.log("\n✅ Test 5 PASSED — Upstash レート制限は正常に動作しています");
}
