import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password: unknown = body?.password;

  const secret = process.env.ADMIN_SECRET ?? "";

  // 定数時間比較（タイミング攻撃対策）
  let matches = false;
  if (typeof password === "string" && password.length === secret.length && secret.length > 0) {
    try {
      matches = timingSafeEqual(Buffer.from(password), Buffer.from(secret));
    } catch {
      matches = false;
    }
  }

  if (!matches) {
    // 失敗時に200ms の遅延を加えてブルートフォースを遅延させる
    await new Promise((r) => setTimeout(r, 200));
    return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  return NextResponse.json({ token: secret });
}
