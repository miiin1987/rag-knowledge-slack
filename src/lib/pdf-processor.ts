import "server-only";
import { resolve } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { readFile } from "fs/promises";
import type { PageText, TextChunk } from "@/types";

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PAGES = 50;

/** PDF のマジックバイト: %PDF- (25 50 44 46 2D) */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function validatePdf(buffer: ArrayBuffer, filename: string): void {
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(
      `ファイルサイズが上限（10MB）を超えています。現在: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`
    );
  }
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new Error("PDFファイルのみアップロードできます。");
  }
  if (buffer.byteLength < PDF_MAGIC.length) {
    throw new Error("無効なPDFファイルです。");
  }
  const header = new Uint8Array(buffer, 0, PDF_MAGIC.length);
  if (!PDF_MAGIC.every((b, i) => header[i] === b)) {
    throw new Error("PDFファイルのみアップロードできます。ファイル形式を確認してください。");
  }
}

// ── pdfjs-dist の設定 ────────────────────────────────────────

function getPdfjsResourcePaths() {
  const base = resolve(process.cwd(), "node_modules", "pdfjs-dist");
  return {
    cMapUrl:          pathToFileURL(resolve(base, "cmaps")).href + "/",
    standardFontUrl:  pathToFileURL(resolve(base, "standard_fonts")).href + "/",
    workerUrl:        pathToFileURL(resolve(base, "legacy", "build", "pdf.worker.mjs")).href,
  };
}

/**
 * pdfjs-dist v6 向けカスタム BinaryDataFactory。
 *
 * 標準の NodeBinaryDataFactory は fs.readFile() に "file://..." の文字列を
 * そのまま渡すため ENOENT になる（fs は URL オブジェクトのみ受け付ける）。
 * fileURLToPath() で変換することで CMap・標準フォントを正しく読み込む。
 */
class NodeFsBinaryDataFactory {
  private cMapUrl: string | null;
  private standardFontDataUrl: string | null;
  private wasmUrl: string | null;

  constructor({ cMapUrl = null, standardFontDataUrl = null, wasmUrl = null }: {
    cMapUrl?: string | null;
    standardFontDataUrl?: string | null;
    wasmUrl?: string | null;
  }) {
    this.cMapUrl = cMapUrl;
    this.standardFontDataUrl = standardFontDataUrl;
    this.wasmUrl = wasmUrl;
  }

  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const baseUrl =
      kind === "cMapUrl"           ? this.cMapUrl :
      kind === "standardFontDataUrl" ? this.standardFontDataUrl :
      kind === "wasmUrl"           ? this.wasmUrl :
      null;
    if (!baseUrl) throw new Error(`API parameter \`${kind}\` is not provided.`);
    const url = `${baseUrl}${filename}`;
    const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;
    const data = await readFile(filePath);
    return new Uint8Array(data);
  }
}

let workerInitialized = false;

async function loadPdfDocument(buffer: ArrayBuffer) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  const { getDocument, GlobalWorkerOptions } = pdfjs;

  if (!workerInitialized) {
    GlobalWorkerOptions.workerSrc = getPdfjsResourcePaths().workerUrl;
    workerInitialized = true;
  }

  const { cMapUrl, standardFontUrl } = getPdfjsResourcePaths();

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: standardFontUrl,
    BinaryDataFactory: NodeFsBinaryDataFactory,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  return { pdf, loadingTask };
}

// ── テキスト抽出 ─────────────────────────────────────────────

export async function extractTextFromPdf(
  buffer: ArrayBuffer
): Promise<{ pages: PageText[]; pageCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pdf, loadingTask } = await loadPdfDocument(buffer) as any;
  const pageCount: number = pdf.numPages;

  if (pageCount > MAX_PAGES) {
    await loadingTask.destroy();
    throw new Error(
      `ページ数が上限（${MAX_PAGES}ページ）を超えています。現在: ${pageCount}ページ`
    );
  }

  const pages: PageText[] = [];

  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text: string = (textContent.items as Array<{ str?: string }>)
        .map((item) => item.str ?? "")
        .join("")
        .trim();

      if (text.length > 0) {
        pages.push({ pageNumber: i, text });
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  if (process.env.DEBUG_PDF) {
    console.log(`[pdf] total=${pageCount} pagesWithText=${pages.length}`);
    for (const p of pages.slice(0, 3)) {
      console.log(`[pdf] page ${p.pageNumber}: ${p.text.length} chars, sample: "${p.text.slice(0, 60).replace(/\n/g, "↵")}"`);
    }
  }

  return { pages, pageCount };
}

// ── チャンク分割 ─────────────────────────────────────────────

export function splitIntoChunks(pages: PageText[]): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const page of pages) {
    const pageChunks = splitText(page.text, CHUNK_SIZE, CHUNK_OVERLAP);
    pageChunks.forEach((content, index) => {
      chunks.push({
        content,
        pageNumber: page.pageNumber,
        chunkIndex: index,
      });
    });
  }

  return chunks;
}

function splitText(text: string, maxSize: number, overlap: number): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    if (end < text.length) {
      const paraBreak = text.lastIndexOf("\n\n", end);
      if (paraBreak > start + maxSize / 2) {
        end = paraBreak;
      } else {
        const sentenceEnd = text.lastIndexOf("。", end);
        if (sentenceEnd > start + maxSize / 2) {
          end = sentenceEnd + 1;
        }
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}
