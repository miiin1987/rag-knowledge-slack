/**
 * 修正後の pdf-processor ロジックを直接テストするスクリプト。
 * CMap設定が正しく動作し、既存PDFの抽出が壊れていないことを確認する。
 *
 * 使用: node scripts/verify-extraction.mjs [追加PDFのパス]
 */

import { readFileSync, existsSync } from "fs";
import { PDFParse } from "pdf-parse";
import { resolve } from "path";
import { pathToFileURL } from "url";

function getCMapUrl() {
  const internal = resolve(
    process.cwd(),
    "node_modules", "pdf-parse",
    "node_modules", "pdfjs-dist", "cmaps"
  );
  const topLevel = resolve(process.cwd(), "node_modules", "pdfjs-dist", "cmaps");
  const dir = existsSync(internal) ? internal : topLevel;
  return pathToFileURL(dir).href + "/";
}

async function extractText(filePath) {
  const data = readFileSync(filePath);
  const cMapUrl = getCMapUrl();
  const parser = new PDFParse({ data: Buffer.from(data), cMapUrl, cMapPacked: true });
  try {
    const result = await parser.getText();
    const pagesWithText = result.pages.filter(p => p.text.trim().length > 0);
    const totalChars = pagesWithText.reduce((s, p) => s + p.text.length, 0);
    const hasJapanese = pagesWithText.some(p => /[぀-鿿]/.test(p.text));
    const pageDetails = pagesWithText.slice(0, 2).map(p => {
      const sample = p.text.slice(0, 80).replace(/\n/g, "↵");
      return "  page" + p.num + " (" + p.text.length + " chars): " + sample;
    });
    return {
      ok: pagesWithText.length > 0,
      total: result.total,
      pagesWithText: pagesWithText.length,
      totalChars,
      hasJapanese,
      pageDetails,
    };
  } finally {
    await parser.destroy();
  }
}

const testFiles = [
  "./test-pdfs/就業規則.pdf",
  "./test-pdfs/経費精算規程.pdf",
  "./test-pdfs/IT利用ガイドライン.pdf",
  "./scripts/test-japanese.pdf",
];

// コマンドライン引数で追加PDFを指定可能
if (process.argv[2]) testFiles.push(process.argv[2]);

console.log("=== PDF抽出検証 (cMapUrl設定あり) ===\n");
console.log("cMapUrl:", getCMapUrl());
console.log();

let passed = 0;
let failed = 0;

for (const file of testFiles) {
  if (!existsSync(file)) {
    console.log("SKIP:", file, "(ファイルなし)");
    continue;
  }
  const name = file.split(/[/\\]/).pop();
  try {
    const r = await extractText(file);
    const status = r.ok ? "✅ OK" : "❌ FAIL";
    const japStr = r.hasJapanese ? "日本語✓" : "日本語なし";
    console.log(status, name, "- pages:" + r.total, "withText:" + r.pagesWithText, "chars:" + r.totalChars, japStr);
    r.pageDetails.forEach(d => console.log(d));
    r.ok ? passed++ : failed++;
  } catch(e) {
    console.log("❌ ERROR", name, "-", e.message.slice(0, 100));
    failed++;
  }
  console.log();
}

console.log("結果:", passed, "件成功,", failed, "件失敗");
if (failed > 0) process.exit(1);
