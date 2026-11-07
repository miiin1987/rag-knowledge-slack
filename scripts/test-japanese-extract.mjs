/**
 * 日本語PDFテキスト抽出テスト
 * 1. システムフォントで日本語PDFを生成
 * 2. CMap設定なし（旧コード）で抽出 → 失敗を確認
 * 3. CMap設定あり（新コード）で抽出 → 成功を確認
 *
 * 使用: node scripts/test-japanese-extract.mjs
 * 自分のPDFで試す: node scripts/test-japanese-extract.mjs /path/to/your.pdf
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { PDFParse } from "pdf-parse";

const TEST_PDF_PATH = "scripts/test-japanese.pdf";

// コマンドライン引数で外部PDFを指定可能
const externalPdf = process.argv[2];

// ==================== 1. 日本語PDFの生成 ====================

async function generateJapanesePdf() {
  if (externalPdf) {
    console.log(`\n外部PDFを使用: ${externalPdf}`);
    return readFileSync(externalPdf);
  }

  console.log("\n--- Step 1: 日本語PDFを生成 ---");

  // システムフォントを探す（優先順位順）
  const fontCandidates = [
    "scripts/fonts/NotoSansJP-Regular.ttf",   // 推奨: 最も互換性が高い
    "C:\\Windows\\Fonts\\HGRSKP.TTF",          // HG正楷書体PRO（TTF）
    "C:\\Windows\\Fonts\\HGRSMP.TTF",          // HGマルゴシックMPRO（TTF）
  ];

  let fontPath = null;
  for (const p of fontCandidates) {
    if (existsSync(p)) {
      fontPath = p;
      break;
    }
  }

  if (!fontPath) {
    console.error("日本語フォントが見つかりません。scripts/fonts/NotoSansJP-Regular.ttf を配置してください。");
    process.exit(1);
  }

  console.log("使用フォント:", fontPath);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = [
    {
      title: "就業規則",
      lines: [
        "第1条（目的）",
        "本規則は、会社および従業員が守るべき基本的なルールを定める。",
        "",
        "第3条（所定労働時間）",
        "所定労働時間は、1日8時間、週40時間とする。",
        "始業時刻は午前9時00分、終業時刻は午後6時00分とする。",
        "",
        "第7条（年次有給休暇）",
        "入社後6ヶ月経過時に10日、以後1年ごとに付与する。",
        "",
        "第10条（給与体系）",
        "通勤手当: 実費（上限月50,000円）",
      ],
    },
    {
      title: "経費精算規程",
      lines: [
        "第4条（交通費）",
        "タクシー: 深夜（午後10時以降）または公共交通機関がない場合のみ。",
        "自家用車: 1km あたり15円。",
        "",
        "第6条（接待交際費）",
        "取引先接待（1〜5名）: 1人あたり10,000円まで。",
        "",
        "第7条（物品購入）",
        "50,000円以上: 稟議書提出および経営会議承認が必要。",
      ],
    },
  ];

  for (const pageData of pages) {
    const page = pdfDoc.addPage([595, 842]); // A4
    const { height } = page.getSize();

    // タイトル（日本語）
    page.drawText(pageData.title, {
      x: 50, y: height - 60, size: 16,
      font, color: rgb(0.1, 0.1, 0.4),
    });

    page.drawLine({
      start: { x: 50, y: height - 72 },
      end: { x: 545, y: height - 72 },
      thickness: 0.5, color: rgb(0.7, 0.7, 0.7),
    });

    let y = height - 100;
    for (const line of pageData.lines) {
      if (y < 60) break;
      if (line.trim() === "") { y -= 12; continue; }
      page.drawText(line, {
        x: 50, y, size: 11,
        font, color: rgb(0, 0, 0),
      });
      y -= 20;
    }
  }

  const pdfBytes = await pdfDoc.save();
  writeFileSync(TEST_PDF_PATH, pdfBytes);
  console.log(`生成完了: ${TEST_PDF_PATH} (${pdfBytes.length} bytes, ${pages.length}ページ)`);
  return pdfBytes;
}

// ==================== 2. テキスト抽出テスト ====================

async function testExtraction(pdfData, useCMap) {
  const cMapLabel = useCMap ? "CMap設定あり（修正後）" : "CMap設定なし（修正前）";
  console.log(`\n--- ${cMapLabel} ---`);

  const cmapDir = resolve(
    process.cwd(), "node_modules", "pdf-parse",
    "node_modules", "pdfjs-dist", "cmaps"
  );
  const cMapUrl = pathToFileURL(cmapDir).href + "/";

  const options = {
    data: Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData),
    ...(useCMap ? { cMapUrl, cMapPacked: true } : {}),
  };

  const parser = new PDFParse(options);
  try {
    const result = await parser.getText();
    const pagesWithText = result.pages.filter((p) => p.text.trim().length > 0);

    console.log(`総ページ数: ${result.total}`);
    console.log(`テキストあるページ: ${pagesWithText.length}/${result.pages.length}`);

    if (pagesWithText.length === 0) {
      console.log("❌ 抽出失敗: テキストが取得できませんでした");
      return false;
    }

    for (const p of result.pages.slice(0, 2)) {
      const preview = p.text.trim().slice(0, 100).replace(/\n/g, "↵");
      console.log(`ページ ${p.num} (${p.text.length} chars): "${preview}"`);
    }

    // 日本語文字が含まれているか確認
    const hasJapanese = result.pages.some((p) =>
      /[぀-鿿]/.test(p.text)
    );
    console.log(`日本語文字を含む: ${hasJapanese ? "✓ Yes" : "❌ No"}`);
    console.log(useCMap && hasJapanese ? "✅ 抽出成功" : useCMap ? "⚠️  抽出はできたが日本語文字なし" : "");
    return hasJapanese;
  } catch (e) {
    console.log(`❌ エラー: ${e.message}`);
    return false;
  } finally {
    await parser.destroy();
  }
}

// ==================== メイン ====================

async function main() {
  console.log("=== 日本語PDFテキスト抽出テスト ===");

  const pdfBytes = await generateJapanesePdf();

  const withoutCMap = await testExtraction(pdfBytes, false);
  const withCMap = await testExtraction(pdfBytes, true);

  console.log("\n=== 結果まとめ ===");
  console.log(`CMap設定なし: ${withoutCMap ? "成功（ToUnicode埋め込み済みフォント）" : "失敗"}`);
  console.log(`CMap設定あり: ${withCMap ? "成功 ✅" : "失敗 ❌"}`);

  if (!withCMap) {
    console.log("\nCMap設定ありでも失敗する場合:");
    console.log("1. PDFがスキャン画像（OCR不要）の可能性");
    console.log("2. 特殊な暗号化が施されている可能性");
    console.log("3. pdftotext -layout your.pdf - で本文を確認してください");
  }
}

main().catch((e) => { console.error("致命的エラー:", e); process.exit(1); });
