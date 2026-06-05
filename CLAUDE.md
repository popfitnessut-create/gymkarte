# GymKarte — 開発メモ

パーソナルジム向けの会員カルテ管理デスクトップアプリ（個人利用）。

## 技術構成
- Electron（main / preload / renderer、contextIsolation + contextBridge）
- React 18 + Vite + Tailwind CSS
- 状態管理: Zustand（`src/store/useStore.js`）
- DB: better-sqlite3（同期API・トランザクション・prepared statement）

## ディレクトリ構成
- `electron/` — メインプロセス
  - `db.js` — スキーマ作成 `createSchema()` / マイグレーション `migrate()` / 初期データ `seedDefaults()`
  - `ipc.js` — 全IPCハンドラ（members / tickets / sessions / daily / stats / settings / backup / excel）
  - `preload.js` — `window.api.*` を contextBridge で公開
- `src/`
  - `pages/` — Dashboard / MemberList / MemberDetail / MultiKarte など
  - `components/` — SessionsTab / TicketsTab / DailyListTab / AnalyticsTab / ExcelImport / BodyMap など
  - `lib/` — `plans.js`（プラン定義・MUSCLE_OPTIONS 等）, `format.js`
- DB実体: Electron の userData 配下 `data/gymkarte.db`

## ドメインの要点
- 会員は `plan_type`: `ticket`（回数券）か `monthly`（月額プラン）。
  - 回数券は「8回数券 / 12回数券」（価格 25600 / 31800円、`TICKET_SPECS`）。
  - 月額プランは `MONTHLY_LIMITS`（例: ポッププラン=月4回）で当月上限を判定。
- セッション記録（`SessionsTab`）は行カード型。新規は下へ追加（日付昇順）。
  - メニューは自由記述（1行=1種目）＋プリセットドロップダウン。
  - 日次カルテはセッション内の自由記述テキスト（`daily_logs.member_comment`）に統合。
  - 「残数」は日付順に各セッション時点の残数を都度カウントダウン表示
    （購入総数を「現在残数＋消費済みセッション数」から推定）。
  - 回数券消費チェックは `plan_type === 'ticket'` のときのみ表示。
  - 利用上限到達時は新規カルテ登録をアラートで抑止。
- マルチカルテ（`MultiKarte`）= 複数会員の同時記録。
  - `members:cards` が残回数・前回来店・`last_menu`・直近3セッション（`recent`: date/muscles/menu）を返す。
- ダッシュボードの残数アラートは「回数券プラン会員のみ・残2回以下」。

## 既存DBへの変更（重要）
- スキーマ/データ変更は `db.js` の `migrate()` に追記し、アプリ**再起動**で適用される。
- `seedDefaults()` は空DB時のみ実行されるため、既存DBへの反映には使えない。
- 種目プリセットの追加・削除のような一度きりの適用は、`settings` テーブルのフラグで
  ガードする（例: `presets_v2_done`）。`migratePresetsV2()` 参照。

## 検証方法（サンドボックス）
- このサンドボックスでは `npm run build` は通らない
  （Mac向けにビルドされた node_modules / rollup の MODULE_NOT_FOUND のため）。
- 代わりに以下で構文検証する:
  - Electronの `.js`: `node --check electron/xxx.js`
  - JSX: `@babel/parser` で parse（`sourceType:'module'`, `plugins:['jsx']`）
- 動作確認はユーザーがアプリを再起動して行う。

## ライトテーマについて
- 白基調（ライトテーマ）。`tailwind.config.js` で `navy` トークンを淡色へ再マップし、
  `gray` スケールを反転（小さい番号＝濃い文字色）することで既存の暗色前提クラスを流用。
- `src/index.css` で body 背景 `#ffffff` / 文字 `#111827`。
