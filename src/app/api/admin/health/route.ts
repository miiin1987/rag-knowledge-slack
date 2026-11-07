import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyAdminToken, unauthorizedResponse } from "@/lib/admin-auth";

/**
 * Supabase 接続・テーブル存在確認用の診断エンドポイント。
 * 管理者認証が必要。秘密情報はレスポンスに含めない。
 */
export async function GET(request: Request) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 1. 環境変数の存在確認（値は出力しない）
  checks.env_supabase_url = {
    ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project.supabase.co",
    detail: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL === "https://your-project.supabase.co"
        ? "プレースホルダーのままです"
        : "設定済み"
      : "未設定",
  };

  checks.env_service_key = {
    ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    detail: process.env.SUPABASE_SERVICE_ROLE_KEY ? "設定済み" : "未設定",
  };

  checks.env_openai_key = {
    ok: !!process.env.OPENAI_API_KEY,
    detail: process.env.OPENAI_API_KEY ? "設定済み" : "未設定",
  };

  checks.env_admin_secret = {
    ok: !!process.env.ADMIN_SECRET,
    detail: process.env.ADMIN_SECRET ? "設定済み" : "未設定",
  };

  // 2. Supabase 接続テスト（documents テーブルへの COUNT クエリ）
  try {
    const { count, error } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true });

    if (error) {
      checks.supabase_documents = {
        ok: false,
        detail: `エラー: ${error.message} (code: ${error.code})`,
      };
    } else {
      checks.supabase_documents = {
        ok: true,
        detail: `接続OK / ${count ?? 0} 件`,
      };
    }
  } catch (e) {
    checks.supabase_documents = {
      ok: false,
      detail: `例外: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 3. chunks テーブルの確認
  try {
    const { count, error } = await supabase
      .from("chunks")
      .select("*", { count: "exact", head: true });

    if (error) {
      checks.supabase_chunks = {
        ok: false,
        detail: `エラー: ${error.message} (code: ${error.code})`,
      };
    } else {
      checks.supabase_chunks = {
        ok: true,
        detail: `接続OK / ${count ?? 0} 件`,
      };
    }
  } catch (e) {
    checks.supabase_chunks = {
      ok: false,
      detail: `例外: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 4. search_chunks 関数の存在確認
  try {
    const { error } = await supabase.rpc("search_chunks", {
      query_embedding: new Array(1536).fill(0),
      match_threshold: 0.99,
      match_count: 1,
    });

    checks.supabase_search_fn = {
      ok: !error || error.code === "PGRST301", // 結果0件は正常
      detail: error
        ? `エラー: ${error.message} (code: ${error.code})`
        : "関数存在確認OK",
    };
  } catch (e) {
    checks.supabase_search_fn = {
      ok: false,
      detail: `例外: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  // サーバーログにも出力
  console.log("[health] checks:", JSON.stringify(checks, null, 2));

  return NextResponse.json({ ok: allOk, checks });
}
