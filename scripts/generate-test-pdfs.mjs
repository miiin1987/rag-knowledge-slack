/**
 * 架空の社内文書 PDF を生成するスクリプト
 *
 * 【事前準備】日本語フォントを用意してください:
 *   1. https://fonts.google.com/noto/specimen/Noto+Sans+JP からダウンロード
 *   2. NotoSansJP-Regular.ttf を scripts/fonts/ に配置
 *   3. このスクリプトを実行: node scripts/generate-test-pdfs.mjs
 *
 * フォントがない場合は ASCII のみでも生成できます（--ascii フラグ）:
 *   node scripts/generate-test-pdfs.mjs --ascii
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "test-pdfs");
const ASCII_MODE = process.argv.includes("--ascii");

// 日本語フォント候補（優先順）
const FONT_CANDIDATES = [
  join(__dirname, "fonts", "NotoSansJP-Regular.ttf"),   // 推奨
  "C:\\Windows\\Fonts\\HGRSKP.TTF",                     // HG正楷書体PRO
  "C:\\Windows\\Fonts\\HGRSMP.TTF",                     // HGマルゴシックMPRO
  "C:\\Windows\\Fonts\\MSGOTHIC.TTC",                   // MS ゴシック
  "C:\\Windows\\Fonts\\MEIRYO.TTC",                     // メイリオ
];
const FONT_PATH = FONT_CANDIDATES.find(existsSync) ?? null;

// フォントを読み込む（日本語 or フォールバック）
async function loadFont(doc) {
  if (!ASCII_MODE && FONT_PATH) {
    doc.registerFontkit(fontkit);
    const fontBytes = readFileSync(FONT_PATH);
    console.log(`✓ 日本語フォント: ${FONT_PATH}`);
    return await doc.embedFont(fontBytes, { subset: true });
  }
  console.log(
    ASCII_MODE
      ? "ASCIIモードで生成します。"
      : `⚠️  日本語フォントが見つかりません。ASCIIモードにフォールバックします。\n   日本語PDFにするには scripts/fonts/NotoSansJP-Regular.ttf を配置してください。`
  );
  return null;
}

// ページに行を追加するヘルパー
function drawLines(page, lines, font, fallbackFont, startY, options = {}) {
  const { fontSize = 11, lineHeight = 20, margin = 50, color = rgb(0, 0, 0) } = options;
  let y = startY;

  for (const line of lines) {
    if (y < 60) break; // ページ下部余白
    const displayFont = font ?? fallbackFont;
    const displayText = font ? line : line.replace(/[^\x00-\x7F]/g, "?");
    page.drawText(displayText, {
      x: margin,
      y,
      size: fontSize,
      font: displayFont,
      color,
    });
    y -= lineHeight;
  }
  return y;
}

// タイトルページを描画するヘルパー
function drawTitle(page, title, subtitle, font, fallbackFont, { width, height }) {
  const f = font ?? fallbackFont;
  const t = font ? title : title.replace(/[^\x00-\x7F]/g, "?");
  const s = font ? subtitle : subtitle.replace(/[^\x00-\x7F]/g, "?");
  page.drawText(t, { x: 60, y: height / 2 + 30, size: 20, font: f, color: rgb(0.1, 0.1, 0.4) });
  page.drawText(s, { x: 60, y: height / 2, size: 13, font: f, color: rgb(0.4, 0.4, 0.4) });
}

// ============================================================
// 文書データ定義
// ============================================================

const documents = [
  {
    filename: "就業規則.pdf",
    pages: [
      {
        title: "就業規則",
        lines: [
          "株式会社テクノシンシュウ 就業規則",
          "制定: 2020年4月1日  最終改訂: 2025年10月1日",
          "",
          "第1章 総則",
          "第1条（目的）",
          "本規則は、株式会社テクノシンシュウ（以下「会社」）の従業員の就業に関する",
          "事項を定め、会社および従業員が守るべき基本的なルールを明確にすることを目的とする。",
          "",
          "第2条（適用範囲）",
          "本規則は、会社に雇用されるすべての正社員に適用する。",
          "契約社員・パートタイム労働者については別に定める。",
        ],
      },
      {
        title: "第2章 労働時間・休憩",
        lines: [
          "第3条（所定労働時間）",
          "1. 所定労働時間は、1日8時間、週40時間とする。",
          "2. 始業時刻は午前9時00分、終業時刻は午後6時00分とする。",
          "3. フレックスタイム制を採用する部署ではコアタイムを午前10時〜午後3時とする。",
          "",
          "第4条（休憩時間）",
          "休憩時間は正午から午後1時までの1時間とする。",
          "",
          "第5条（時間外労働）",
          "業務上必要な場合、会社は従業員に時間外労働を命じることができる。",
          "時間外労働の上限は月45時間、年360時間とする。",
          "特別条項適用時の上限は月100時間（年間6回まで）とする。",
        ],
      },
      {
        title: "第3章 休日・休暇",
        lines: [
          "第6条（休日）",
          "1. 週休2日制（土曜・日曜）",
          "2. 国民の祝日（祝日法による）",
          "3. 年末年始: 12月29日〜1月3日",
          "4. 夏季休暇: 8月13日〜8月15日（3日間）",
          "",
          "第7条（年次有給休暇）",
          "入社後6ヶ月経過時に10日、以後1年ごとに下記のとおり付与する。",
          "  1年6ヶ月: 11日  2年6ヶ月: 12日  3年6ヶ月: 14日",
          "  4年6ヶ月: 16日  5年6ヶ月: 18日  6年6ヶ月以上: 20日",
          "有給休暇の繰り越しは最大2年分（40日）まで認める。",
          "",
          "第8条（特別休暇）",
          "結婚: 5日  忌引き（配偶者・父母）: 5日  出生: 3日",
        ],
      },
      {
        title: "第4章 給与",
        lines: [
          "第9条（給与の支払い）",
          "給与は毎月25日（休日の場合は前営業日）に支払う。",
          "支払い方法: 従業員が指定する銀行口座への振込",
          "",
          "第10条（給与体系）",
          "1. 基本給: 職務等級に応じて別表のとおり定める",
          "2. 役職手当: 係長 15,000円 / 課長 30,000円 / 部長 50,000円",
          "3. 通勤手当: 実費（上限月50,000円）",
          "4. 時間外手当: 法定に基づき計算",
          "",
          "第11条（昇給・賞与）",
          "昇給: 年1回（4月）業績・評価に基づき決定",
          "賞与: 年2回（6月・12月）業績に応じて支給",
        ],
      },
    ],
  },
  {
    filename: "経費精算規程.pdf",
    pages: [
      {
        title: "経費精算規程",
        lines: [
          "株式会社テクノシンシュウ 経費精算規程",
          "改訂: 2025年4月1日",
          "",
          "第1条（目的）",
          "業務上発生した費用の精算手続きおよび上限額を定める。",
          "",
          "第2条（適用範囲）",
          "会社の業務遂行に関連して従業員が立替払いした費用に適用する。",
          "",
          "第3条（精算の基本原則）",
          "1. 領収書（原本）の添付が必須",
          "2. 申請期限: 費用発生日から30日以内",
          "3. 10,000円以上の費用は事前に上長の承認が必要",
        ],
      },
      {
        title: "交通費・出張費",
        lines: [
          "第4条（交通費）",
          "1. 電車・バス: 実費（最安経路）",
          "2. タクシー: 深夜（午後10時以降）または公共交通機関がない場合のみ",
          "3. 自家用車: 1km あたり15円（ガソリン代相当）",
          "",
          "第5条（出張旅費）",
          "日帰り出張（東京都内）: 交通費実費のみ",
          "日帰り出張（都外）: 交通費実費 + 日当2,000円",
          "",
          "宿泊出張（1泊）:",
          "  交通費実費 + 宿泊費上限15,000円 + 日当2,000円",
          "",
          "宿泊出張（海外）:",
          "  航空券実費（エコノミークラス） + 宿泊費上限25,000円/泊",
          "  + 海外日当: アジア3,000円 / 欧米5,000円",
        ],
      },
      {
        title: "接待費・物品購入",
        lines: [
          "第6条（接待交際費）",
          "1件あたりの上限額:",
          "  社員間の懇親会: 5,000円/人",
          "  取引先接待（1〜5名）: 10,000円/人",
          "  取引先接待（6名以上）: 8,000円/人",
          "  会議室・弁当代（社内会議）: 1,000円/人",
          "",
          "接待費申請には以下の記載が必要:",
          "  接待相手の会社名・役職・氏名",
          "  接待の目的・商談内容の概要",
          "",
          "第7条（物品購入）",
          "業務用消耗品: 一件5,000円以下は申請不要（部署予算内）",
          "5,000円〜50,000円: 上長承認後に購入",
          "50,000円以上: 稟議書提出および経営会議承認が必要",
        ],
      },
    ],
  },
  {
    filename: "製品仕様書_SmartAssist.pdf",
    pages: [
      {
        title: "SmartAssist v3.2 製品仕様書",
        lines: [
          "製品名: SmartAssist（スマートアシスト）",
          "バージョン: 3.2.1",
          "発行日: 2025年9月15日",
          "対象: 営業・カスタマーサポート部門向け",
          "",
          "1. 製品概要",
          "SmartAssist は、AIを活用した問い合わせ自動応答・CRM連携ソフトウェアです。",
          "自然言語処理エンジンにより顧客からの問い合わせを分類し、",
          "適切な担当者へのルーティングまたは自動回答を実現します。",
        ],
      },
      {
        title: "システム要件",
        lines: [
          "2. 動作環境・システム要件",
          "",
          "2.1 サーバー要件（オンプレミス版）",
          "  OS: Ubuntu 22.04 LTS / Windows Server 2022",
          "  CPU: 8コア以上（推奨: 16コア）",
          "  メモリ: 32GB以上（推奨: 64GB）",
          "  ストレージ: SSD 500GB以上",
          "  ネットワーク: 1Gbps以上",
          "",
          "2.2 クラウド版 (SaaS)",
          "  ブラウザ: Chrome 120以上 / Edge 120以上 / Firefox 121以上",
          "  インターネット回線: 10Mbps以上推奨",
          "",
          "2.3 API連携要件",
          "  Salesforce: API v54以上",
          "  Zendesk: REST API v2",
          "  Slack: Webhook / Bot Token",
        ],
      },
      {
        title: "主要機能",
        lines: [
          "3. 主要機能",
          "",
          "3.1 AI自動応答",
          "  正答率: 92%以上（社内テストデータ基準）",
          "  対応言語: 日本語・英語・中国語（簡体字）",
          "  応答速度: 平均1.2秒以内",
          "",
          "3.2 チケット管理",
          "  優先度自動分類（高/中/低）",
          "  SLAタイマー機能（初回応答: 2時間 / 解決: 24時間）",
          "  一括対応・テンプレート返信",
          "",
          "3.3 分析レポート",
          "  日次・週次・月次の自動レポート生成",
          "  顧客満足度スコア（CSAT）集計",
          "  担当者別パフォーマンス分析",
        ],
      },
      {
        title: "料金・ライセンス",
        lines: [
          "4. ライセンス・価格",
          "",
          "4.1 SaaSプラン（月額）",
          "  Starter: 月額50,000円（エージェント5名まで）",
          "  Business: 月額120,000円（エージェント20名まで）",
          "  Enterprise: 月額300,000円〜（エージェント数無制限）",
          "",
          "4.2 オンプレミス版",
          "  初期費用: 2,000,000円〜（規模による）",
          "  年間保守費用: 初期費用の20%",
          "",
          "4.3 無料トライアル",
          "  期間: 30日間（全機能利用可能）",
          "  登録: https://smartassist.example.jp/trial",
        ],
      },
    ],
  },
  {
    filename: "IT利用ガイドライン.pdf",
    pages: [
      {
        title: "IT機器・情報セキュリティ利用ガイドライン",
        lines: [
          "株式会社テクノシンシュウ",
          "IT機器・情報セキュリティ利用ガイドライン",
          "制定: 2023年1月  最終改訂: 2025年6月",
          "",
          "はじめに",
          "本ガイドラインは、会社の情報資産を適切に管理・保護するため、",
          "全従業員が遵守すべきIT機器の利用ルールと情報セキュリティに関する",
          "方針を定めるものです。違反した場合は就業規則に基づき処分の対象となります。",
        ],
      },
      {
        title: "PC・端末管理",
        lines: [
          "第2章 PC・モバイル端末の管理",
          "",
          "2.1 貸与端末の取り扱い",
          "  - 会社貸与のPCは業務目的以外に使用しないこと",
          "  - 離席時は必ずスクリーンロック（Windowsキー+L）を行うこと",
          "  - 外出先での使用時はのぞき見防止フィルターを装着すること",
          "",
          "2.2 ソフトウェアのインストール",
          "  - 業務用ソフトのインストールはIT部門の承認を得ること",
          "  - 承認なしの外部ソフト・フリーソフトのインストールは禁止",
          "  - OSおよびウイルス対策ソフトの自動更新を無効にしないこと",
          "",
          "2.3 パスワード管理",
          "  - 長さ: 12文字以上",
          "  - 英大文字・小文字・数字・記号を組み合わせること",
          "  - 90日ごとに変更すること（前回と異なるパスワード）",
          "  - パスワードの使い回し・他者への共有は厳禁",
        ],
      },
      {
        title: "情報の取り扱い",
        lines: [
          "第3章 情報の分類と取り扱い",
          "",
          "3.1 情報分類",
          "  機密情報: 顧客個人情報、財務データ、未公開の製品情報、契約書",
          "  社外秘情報: 社内マニュアル、業績データ、人事情報",
          "  一般情報: 公開済みプレスリリース、カタログ",
          "",
          "3.2 機密情報の取り扱い",
          "  - 暗号化されたストレージ（Bitlocker等）に保存",
          "  - 外部送信時はパスワード付きZIPまたは社内承認済みのクラウドサービスを使用",
          "  - 印刷物は執務室外に持ち出さないこと",
          "  - 廃棄時はシュレッダー処理（電子データはIT部門に依頼）",
          "",
          "3.3 クラウドサービスの利用",
          "  承認済みサービス: Microsoft 365, Box, Zoom, Slack",
          "  個人アカウントへのアップロード禁止（Google Drive個人版, Dropbox等）",
        ],
      },
      {
        title: "インシデント対応",
        lines: [
          "第4章 インシデント対応",
          "",
          "4.1 報告義務",
          "以下のいずれかが発生した場合、直ちに上長およびIT部門に報告すること:",
          "  - PCの紛失・盗難",
          "  - 不審なメール（フィッシング疑い）の受信・クリック",
          "  - ウイルス感染の疑い",
          "  - 情報漏洩の疑い",
          "",
          "4.2 連絡先",
          "  IT部門緊急ホットライン: 内線 2222 / 外線 03-XXXX-XXXX",
          "  メール: security@technosinshu.example.co.jp",
          "  受付時間: 平日8:30〜21:00（緊急時は24時間対応）",
          "",
          "4.3 ペナルティ",
          "  本ガイドライン違反は就業規則第35条に基づき",
          "  口頭注意〜懲戒解雇の対象となる。",
        ],
      },
    ],
  },
  {
    filename: "組織・連絡先一覧.pdf",
    pages: [
      {
        title: "組織・連絡先一覧",
        lines: [
          "株式会社テクノシンシュウ 組織・連絡先一覧",
          "2025年10月1日現在",
          "",
          "本社所在地: 〒100-0001 東京都千代田区サンプル1-2-3",
          "代表電話: 03-XXXX-XXXX  FAX: 03-XXXX-XXXY",
          "公式サイト: https://technosinshu.example.co.jp",
          "",
          "経営陣",
          "  代表取締役社長: 山田 太郎（内線: 1001）",
          "  取締役副社長: 佐藤 花子（内線: 1002）",
          "  取締役CFO: 鈴木 一郎（内線: 1003）",
        ],
      },
      {
        title: "部門一覧",
        lines: [
          "部門別連絡先",
          "",
          "営業部",
          "  部長: 田中 義雄（内線: 2001）",
          "  副部長: 伊藤 美咲（内線: 2002）",
          "  東京営業チーム（内線: 2010〜2019）",
          "  大阪営業チーム（内線: 2020〜2029）",
          "",
          "技術開発部",
          "  部長: 渡辺 健二（内線: 3001）",
          "  バックエンドチーム（内線: 3010〜3019）",
          "  フロントエンドチーム（内線: 3020〜3029）",
          "  インフラチーム（内線: 3030〜3039）",
          "",
          "カスタマーサクセス部",
          "  部長: 中村 恵子（内線: 4001）",
          "  サポートチーム（内線: 4010〜4029）",
        ],
      },
      {
        title: "管理部門",
        lines: [
          "管理部門",
          "",
          "人事・総務部",
          "  部長: 小林 真司（内線: 5001）",
          "  採用担当: recruit@technosinshu.example.co.jp",
          "  総務担当: soumu@technosinshu.example.co.jp",
          "",
          "経理・財務部",
          "  部長: 加藤 由美（内線: 5101）",
          "  経費精算担当: keiri@technosinshu.example.co.jp",
          "  締め日: 毎月末日  支払日: 翌月25日",
          "",
          "IT管理部",
          "  部長: 松本 浩（内線: 2201）",
          "  ヘルプデスク（内線: 2222）",
          "  it-support@technosinshu.example.co.jp",
          "",
          "法務・コンプライアンス部",
          "  部長: 井上 朋子（内線: 5201）",
          "  legal@technosinshu.example.co.jp",
        ],
      },
    ],
  },
];

// ============================================================
// PDF 生成
// ============================================================

async function generatePdf(docData, font, fallbackFont) {
  const pdfDoc = await PDFDocument.create();
  if (font) pdfDoc.registerFontkit(fontkit);

  for (const pageData of docData.pages) {
    const page = pdfDoc.addPage([595, 842]); // A4
    const { height } = page.getSize();

    // ページタイトル
    const titleFont = font ?? fallbackFont;
    const titleText = font
      ? pageData.title
      : pageData.title.replace(/[^\x00-\x7F]/g, "?");

    page.drawText(titleText, {
      x: 50,
      y: height - 60,
      size: 14,
      font: titleFont,
      color: rgb(0.1, 0.1, 0.4),
    });

    // 区切り線
    page.drawLine({
      start: { x: 50, y: height - 70 },
      end: { x: 545, y: height - 70 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });

    drawLines(page, pageData.lines, font, fallbackFont, height - 95, {
      fontSize: 10,
      lineHeight: 18,
    });
  }

  return await pdfDoc.save();
}

async function main() {
  const tmpDoc = await PDFDocument.create();
  const fallbackFont = await tmpDoc.embedFont(StandardFonts.Helvetica);

  if (FONT_PATH) {
    console.log("✓ 日本語フォントを使用:", FONT_PATH);
  }

  for (const docData of documents) {
    const pdfDoc = await PDFDocument.create();
    if (FONT_PATH) pdfDoc.registerFontkit(fontkit);

    // フォントをこのドキュメント用に再埋め込み
    let docFont = null;
    if (!ASCII_MODE && FONT_PATH) {
      pdfDoc.registerFontkit(fontkit);
      const fontBytes = readFileSync(FONT_PATH);
      docFont = await pdfDoc.embedFont(fontBytes, { subset: true });
    }
    const docFallback = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const pageData of docData.pages) {
      const page = pdfDoc.addPage([595, 842]);
      const { height } = page.getSize();

      const titleFont = docFont ?? docFallback;
      const titleText = docFont
        ? pageData.title
        : pageData.title.replace(/[^\x00-\x7F]/g, "?");

      page.drawText(titleText, {
        x: 50,
        y: height - 60,
        size: 14,
        font: titleFont,
        color: rgb(0.1, 0.1, 0.4),
      });

      page.drawLine({
        start: { x: 50, y: height - 72 },
        end: { x: 545, y: height - 72 },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });

      drawLines(page, pageData.lines, docFont, docFallback, height - 95, {
        fontSize: 10,
        lineHeight: 18,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const outputPath = join(OUTPUT_DIR, docData.filename);
    writeFileSync(outputPath, pdfBytes);
    console.log(`✓ 生成完了: ${docData.filename} (${docData.pages.length}ページ)`);
  }

  console.log(`\n全 ${documents.length} 件のPDFを test-pdfs/ に生成しました。`);
  console.log("次のステップ: これらのPDFを管理画面 (/admin) からアップロードしてください。");
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
  process.exit(1);
});
