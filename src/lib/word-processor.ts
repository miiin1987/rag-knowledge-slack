import "server-only";
import mammoth from "mammoth";
import type { PageText } from "@/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
// DOCX は ZIP ファイル: PK\x03\x04 (50 4B 03 04)
const DOCX_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export function validateDocx(buffer: ArrayBuffer, filename: string): void {
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(
      `ファイルサイズが上限（10MB）を超えています。現在: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`
    );
  }
  if (!filename.toLowerCase().endsWith(".docx")) {
    throw new Error("Word文書（.docx）ファイルのみアップロードできます。");
  }
  if (buffer.byteLength < DOCX_MAGIC.length) {
    throw new Error("無効なWord文書ファイルです。");
  }
  const header = new Uint8Array(buffer, 0, DOCX_MAGIC.length);
  if (!DOCX_MAGIC.every((b, i) => header[i] === b)) {
    throw new Error(
      "Word文書（.docx）ファイルのみアップロードできます。ファイル形式を確認してください。"
    );
  }
}

export async function extractTextFromDocx(
  buffer: ArrayBuffer
): Promise<{ pages: PageText[]; pageCount: number }> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });

  const text = result.value.trim();
  if (!text) {
    return { pages: [], pageCount: 0 };
  }

  // DOCX にはページ概念がないため全体を 1 ページとして扱う。
  // splitIntoChunks() がチャンク分割を担うため、ここでは分割しない。
  return {
    pages: [{ pageNumber: 1, text }],
    pageCount: 1,
  };
}
