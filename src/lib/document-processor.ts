import "server-only";
import { validatePdf, extractTextFromPdf, splitIntoChunks } from "./pdf-processor";
import { validateDocx, extractTextFromDocx } from "./word-processor";
import type { PageText } from "@/types";

export { splitIntoChunks };

export function validateDocument(buffer: ArrayBuffer, filename: string): void {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    validatePdf(buffer, filename);
  } else if (lower.endsWith(".docx")) {
    validateDocx(buffer, filename);
  } else {
    throw new Error("PDF または Word文書（.docx）のみアップロードできます。");
  }
}

export async function extractText(
  buffer: ArrayBuffer,
  filename: string
): Promise<{ pages: PageText[]; pageCount: number }> {
  if (filename.toLowerCase().endsWith(".pdf")) {
    return extractTextFromPdf(buffer);
  }
  return extractTextFromDocx(buffer);
}
