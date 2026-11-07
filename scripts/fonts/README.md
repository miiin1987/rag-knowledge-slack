# scripts/fonts/

このディレクトリは `.gitignore` 対象です（大容量のため）。

日本語 PDF を生成するには `NotoSansJP-Regular.ttf` を配置してください。

## 取得方法

[Google Fonts - Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)
からダウンロードして `NotoSansJP-Regular.ttf` として保存。

## 使用スクリプト

```bash
npm run generate-pdfs        # 日本語フォントあり
npm run generate-pdfs:ascii  # フォントなし（ASCII モード）
```
