import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyAdminToken, unauthorizedResponse } from "@/lib/admin-auth";
import { validateDocument, extractText, splitIntoChunks } from "@/lib/document-processor";
import { generateEmbeddings } from "@/lib/embeddings";

export const maxDuration = 60; // Vercel Function のタイムアウト（秒）

export async function POST(request: Request) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();

    // バリデーション
    validateDocument(buffer, file.name);

    // pdfjs-dist がワーカーへデータを転送すると ArrayBuffer が detach されて
    // byteLength が 0 になるため、抽出前にサイズを保存する
    const fileSize = buffer.byteLength;

    // テキスト抽出（PDF / DOCX 共通）
    const { pages, pageCount } = await extractText(buffer, file.name);

    if (pages.length === 0) {
      const isDocx = file.name.toLowerCase().endsWith(".docx");
      const hint = isDocx
        ? "テキストが含まれているか確認してください。"
        : "テキスト埋め込みPDFか確認してください。";
      return NextResponse.json(
        { error: `文書からテキストを抽出できませんでした。${hint}` },
        { status: 400 }
      );
    }

    // チャンク分割
    const chunks = splitIntoChunks(pages);

    // Embedding 生成
    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);

    // documents テーブルに保存
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        filename: `${crypto.randomUUID()}.pdf`,
        original_name: file.name,
        file_size: fileSize,
        page_count: pageCount,
      })
      .select()
      .single();

    if (docError || !doc) {
      console.error("[upload] documents INSERT failed:", {
        code: docError?.code,
        message: docError?.message,
        details: docError?.details,
        hint: docError?.hint,
      });
      throw new Error("ドキュメントの保存に失敗しました");
    }

    // chunks テーブルに一括保存
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: doc.id,
      content: chunk.content,
      page_number: chunk.pageNumber,
      chunk_index: chunk.chunkIndex,
      embedding: embeddings[i],
    }));

    const { error: chunksError } = await supabase
      .from("chunks")
      .insert(chunkRows);

    if (chunksError) {
      console.error("[upload] chunks INSERT failed:", {
        code: chunksError?.code,
        message: chunksError?.message,
        details: chunksError?.details,
        hint: chunksError?.hint,
      });
      // チャンク保存失敗時はドキュメントも削除してロールバック
      await supabase.from("documents").delete().eq("id", doc.id);
      throw new Error("チャンクの保存に失敗しました");
    }

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        original_name: doc.original_name,
        page_count: pageCount,
        chunk_count: chunks.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "予期せぬエラーが発生しました";
    // 予期しない例外はスタックトレース付きでサーバーログに記録
    if (!(err instanceof Error) || !["上限", "のみ", "保存に失敗", "抽出できません"].some((s) => message.includes(s))) {
      console.error("[upload] unexpected error:", err);
    }
    const status = message.includes("上限") || message.includes("のみ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
