import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || supabaseUrl === "https://your-project.supabase.co") {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL が未設定またはプレースホルダーです。" +
      " .env.local を確認してください。"
  );
}
if (!supabaseServiceKey) {
  console.warn("[supabase] SUPABASE_SERVICE_ROLE_KEY が未設定です。");
}

// Service Role クライアント（サーバーサイドのみ）
// db.schema = 'rag7': 案件7専用スキーマを使用。
// .from() / .rpc() がすべて rag7.* にルーティングされ、
// 案件3の public スキーマとは完全に独立する。
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
  db: { schema: "rag7" },
});
