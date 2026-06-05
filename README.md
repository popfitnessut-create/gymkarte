# GymKarte

パーソナルジム会員カルテ管理デスクトップアプリ（Electron + React + SQLite）。
オフライン完結・ローカルDBのみで動作します。

## Phase 1 実装済み

- SQLite（better-sqlite3）DB初期化と全テーブル作成（要件定義書スキーマ準拠）
- Electron メイン / レンダラー基盤、preload経由のセキュアIPC
- 左サイドバーナビゲーション
- 会員一覧画面（テーブル表示・ステータスフィルター）
- 高精度検索（Fuse.js）— 漢字・フリガナ・ひらがな・ローマ字・電話番号・会員ID対応、あいまい検索、キーワードハイライト、残回数/最終来店表示
- 会員詳細「基本情報」タブ（表示・編集・保存・削除、年齢自動計算）
- 新規会員登録モーダル

回数券・セッション・日次カルテ・分析・マルチ展開・Excelインポートは Phase 2 以降。

## セットアップ

```bash
npm install        # postinstallでネイティブモジュール(better-sqlite3)を自動リビルド
npm run dev        # 開発起動（Vite + Electron）
```

初回起動時にサンプル会員3件と種目プリセットが自動投入されます。
DBファイルは OS の userData フォルダ配下（`.../GymKarte/data/gymkarte.db`）に保存されます。

## インストーラー生成

```bash
npm run dist        # 現在のOS向け
npm run dist:win    # Windows (.exe / nsis)
npm run dist:mac    # macOS (.dmg)
```

成果物は `release/` に出力されます。デスクトップアイコンは `assets/icon.png` を差し替えてください
（256px以上のPNG推奨。配布前に各OS用アイコンへ変換されます）。

## 技術スタック

Electron / React / Tailwind CSS / better-sqlite3 / Fuse.js / Zustand / Recharts / Lucide React / electron-builder
