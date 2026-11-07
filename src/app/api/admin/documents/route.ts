import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyAdminToken, unauthorizedResponse } from "@/lib/admin-auth";

export async function GET(request: Request) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  const { data, error } = await supabase
    .from("documents")
    .select("id, original_name, file_size, page_count, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "データベースエラーが発生しました" }, { status: 500 });
  }

  return NextResponse.json({ documents: data });
}

export async function DELETE(request: Request) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
