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
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
