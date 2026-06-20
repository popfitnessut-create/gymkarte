const path = require('path')
const fs = require('fs')

// libSQL（better-sqlite3 互換・クラウド同期対応）を使用。
// libsql はビルド済みバイナリ（NAPI）で動くためコンパイル不要。
// 万一 libsql が読めない環境では better-sqlite3 があればフォールバック、無ければ明示エラー。
let Database
let driver = 'libsql'
try {
  Database = require('libsql')
  driver = 'libsql'
} catch (e) {
  try {
    Database = require('better-sqlite3')
    driver = 'better-sqlite3'
  } catch (e2) {
    throw new Error('データベースドライバ（libsql）の読み込みに失敗しました: ' + e.message)
  }
}

let db = null
let currentDbPath = null
let userDataDir = null

// ===== 同期（クラウド共有）状態 =====
let syncEnabled = false          // 同期モードで起動しているか
let syncTimer = null             // 定期プル用インターバル
let syncDebounce = null          // 書き込み後のまとめ同期用タイマー
let lastSyncAt = null            // 最終同期時刻
let lastSyncError = null         // 直近の同期エラー

const SYNC_CONFIG_FILE = 'sync-config.json'
const PULL_INTERVAL_MS = 3000    // 他端末の変更を取り込む間隔
const PUSH_DEBOUNCE_MS = 400     // 書き込み後に同期するまでの猶予（トランザクションを1回にまとめる）

// 同期設定ファイル（userData/sync-config.json）を読む。{ syncUrl, authToken }
function readSyncConfig() {
  try {
    const p = path.join(userDataDir, SYNC_CONFIG_FILE)
    if (!fs.existsSync(p)) return null
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (raw && typeof raw.syncUrl === 'string' && raw.syncUrl.trim()) {
      return { syncUrl: raw.syncUrl.trim(), authToken: (raw.authToken || '').trim() }
    }
  } catch (e) {
    lastSyncError = '設定ファイルの読み込みに失敗: ' + e.message
  }
  return null
}

// DBファイルの保存先（userData配下）を初期化してスキーマを作成する
function initDb(userDataPath) {
  userDataDir = userDataPath
  const dir = path.join(userDataPath, 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const cfg = driver === 'libsql' ? readSyncConfig() : null

  if (cfg) {
    // ---- クラウド同期モード（埋め込みレプリカ）----
    // ローカルは「レプリカ」専用ファイルを使う（従来の gymkarte.db とは分離し、
    // 既存ローカルデータと衝突させない。プライマリ＝Turso側が正）。
    const replicaPath = path.join(dir, 'gymkarte-sync.db')
    currentDbPath = replicaPath
    try {
      db = new Database(replicaPath, { syncUrl: cfg.syncUrl, authToken: cfg.authToken })
      applyNamedParamShim(db) // libsqlの名前付きパラメータ不具合を回避（@name → ?）
      syncEnabled = true
      // まずプライマリの最新を取り込む（オフライン時は失敗しても続行）
      safeSync()
      try { db.pragma('foreign_keys = ON') } catch (e) { /* レプリカでは無視される場合あり */ }
      installAutoSync()
      createSchema()
      safeSync()
      startPullTimer()
      return replicaPath
    } catch (e) {
      // 同期接続に失敗 → ローカル単独で起動（データ消失を防ぐ）
      lastSyncError = '同期接続に失敗: ' + e.message
      syncEnabled = false
      db = null
      console.error('同期モード起動に失敗 → ローカルにフォールバック:', e.message)
    }
  }

  // ---- ローカル単独モード（従来動作）----
  const dbPath = path.join(dir, 'gymkarte.db')
  currentDbPath = dbPath
  db = new Database(dbPath)
  if (driver === 'libsql') applyNamedParamShim(db) // ローカルモードでも同じ不具合を回避
  try { db.pragma('journal_mode = WAL') } catch (e) { /* libsqlでは未対応の場合あり */ }
  try { db.pragma('foreign_keys = ON') } catch (e) {}
  createSchema()
  return dbPath
}

// 【重要・libsql の名前付きパラメータ対策】
// libsql は名前付きパラメータ（@name + オブジェクト渡し）のバインドが効かず、
// 値が黙って NULL になる（better-sqlite3 では動く）。これにより ipc.js の
// 「INSERT/UPDATE ... @col ... .run({...})」系が全て値を保存できなくなる。
// 対策として prepare 時に SQL 内の @name を ? へ置換し、run/get/all に
// オブジェクトが渡されたら出現順に positional 配列へ並べ替えてから渡す。
// （positional の ? は libsql でも正しく動くことを確認済み）
function applyNamedParamShim(database) {
  const realPrepare = database.prepare.bind(database)
  database.prepare = (sql) => {
    const names = []
    const converted = sql.replace(/@(\w+)/g, (_, n) => { names.push(n); return '?' })
    const stmt = realPrepare(converted)
    if (names.length === 0) return stmt
    const toArgs = (args) => {
      // 単一オブジェクト渡し（{ col: value, ... }）のときだけ positional へ変換。
      // それ以外（既に positional 配列・素の値）はそのまま通す。
      if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        const obj = args[0]
        return names.map((n) => (obj[n] === undefined ? null : obj[n]))
      }
      return args
    }
    for (const method of ['run', 'get', 'all']) {
      if (typeof stmt[method] === 'function') {
        const real = stmt[method].bind(stmt)
        stmt[method] = (...args) => real(...toArgs(args))
      }
    }
    return stmt
  }
}

// db.prepare をラップし、書き込み（run）後にまとめて同期をスケジュールする。
// これにより ipc.js の各ハンドラを個別に変更せず、全書き込みを同期対象にできる。
function installAutoSync() {
  const realPrepare = db.prepare.bind(db)
  db.prepare = (sql) => {
    const stmt = realPrepare(sql)
    if (stmt && typeof stmt.run === 'function') {
      const realRun = stmt.run.bind(stmt)
      stmt.run = (...args) => {
        const res = realRun(...args)
        scheduleSync()
        return res
      }
    }
    return stmt
  }
  // db.exec（スキーマ・マイグレーション）後も一度同期
  const realExec = db.exec.bind(db)
  db.exec = (sql) => {
    const res = realExec(sql)
    scheduleSync()
    return res
  }
}

// 書き込み後の同期をデバウンス（連続書き込み・トランザクションを1回にまとめる）
function scheduleSync() {
  if (!syncEnabled) return
  if (syncDebounce) clearTimeout(syncDebounce)
  syncDebounce = setTimeout(() => { syncDebounce = null; safeSync() }, PUSH_DEBOUNCE_MS)
}

// 実際の同期。失敗してもアプリは継続（オフライン耐性）。
function safeSync() {
  if (!syncEnabled || !db || typeof db.sync !== 'function') return false
  try {
    db.sync()
    lastSyncAt = new Date().toISOString()
    lastSyncError = null
    return true
  } catch (e) {
    lastSyncError = e.message
    console.error('[SYNC] db.sync() 失敗:', e.message)
    return false
  }
}

// 定期プル：他端末の変更を取り込む
function startPullTimer() {
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = setInterval(safeSync, PULL_INTERVAL_MS)
}

function getDbPath() { return currentDbPath }

// 同期状態（設定画面表示用）
function getSyncStatus() {
  const cfg = readSyncConfig()
  return {
    driver,
    enabled: syncEnabled,
    configured: !!cfg,
    syncUrl: cfg ? cfg.syncUrl : '',
    lastSyncAt,
    lastError: lastSyncError,
    canSync: driver === 'libsql'
  }
}

// 設定画面から同期先を保存。次回起動から有効。
function writeSyncConfig({ syncUrl, authToken }) {
  const p = path.join(userDataDir, SYNC_CONFIG_FILE)
  if (!syncUrl || !String(syncUrl).trim()) {
    // 空 → 同期解除（ファイル削除）
    if (fs.existsSync(p)) fs.unlinkSync(p)
    return { ok: true, cleared: true }
  }
  fs.writeFileSync(p, JSON.stringify({ syncUrl: String(syncUrl).trim(), authToken: (authToken || '').trim() }, null, 2), 'utf-8')
  return { ok: true }
}

// 手動同期（設定画面の「今すぐ同期」）
function syncNow() {
  if (!syncEnabled) return { ok: false, reason: 'disabled' }
  const ok = safeSync()
  return { ok, lastSyncAt, error: lastSyncError }
}

// バックアップ復元用：現DBを閉じて別ファイルで開き直す前のクローズ
function closeDb() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null }
  if (syncDebounce) { clearTimeout(syncDebounce); syncDebounce = null }
  if (db) { try { db.close() } catch (e) {} db = null }
}

// 要件定義書のスキーマ通りに全テーブルを作成
function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      furigana TEXT,
      birthdate TEXT,
      gender TEXT,
      phone TEXT,
      email TEXT,
      joined_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      goal TEXT,
      health_notes TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      purchased_at TEXT,
      total_count INTEGER NOT NULL DEFAULT 0,
      remaining_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      price INTEGER,
      notes TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      ticket_id INTEGER,
      session_date TEXT,
      participant_count INTEGER DEFAULT 1,
      trainer_name TEXT,
      coach_comment TEXT,
      next_memo TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS session_muscles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      muscle_name TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      exercise_name TEXT,
      weight_kg REAL,
      sets INTEGER,
      reps INTEGER,
      set_no INTEGER,
      order_index INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      log_date TEXT,
      weight_kg REAL,
      body_fat_pct REAL,
      condition_score INTEGER,
      sleep_hours REAL,
      sleep_quality_score INTEGER,
      meal_notes TEXT,
      water_ml INTEGER,
      member_comment TEXT,
      trainer_note TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trainers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS exercise_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- 評価シート本体（会員ごと・月次で1枚。member_id + year_month で一意）
    CREATE TABLE IF NOT EXISTS evaluation_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      year_month TEXT NOT NULL,
      issued_at TEXT,
      trainer_name TEXT,
      feedback_positive TEXT,
      feedback_next TEXT,
      mascot_note TEXT,
      status TEXT DEFAULT 'issued',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE (member_id, year_month),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    -- 評価シートの種目別記録（基準種目マスタは src/lib/evaluation.js に定義）
    CREATE TABLE IF NOT EXISTS evaluation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sheet_id INTEGER NOT NULL,
      exercise_key TEXT NOT NULL,
      weight REAL,
      reps INTEGER,
      seconds INTEGER,
      note TEXT,
      FOREIGN KEY (sheet_id) REFERENCES evaluation_sheets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_member ON tickets(member_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);
    CREATE INDEX IF NOT EXISTS idx_daily_member ON daily_logs(member_id);
    -- 評価シートのお渡し状況（月初の運用チェック用）。発行なしも記録できる。
    -- status: 'handed'（お渡し済み）/ 'not_handed'（未お渡し）/ 'none'（発行なし）
    CREATE TABLE IF NOT EXISTS evaluation_handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      year_month TEXT NOT NULL,
      status TEXT NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE (member_id, year_month),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_evalsheets_member ON evaluation_sheets(member_id);
    CREATE INDEX IF NOT EXISTS idx_evalrecords_sheet ON evaluation_records(sheet_id);
    CREATE INDEX IF NOT EXISTS idx_evalhandover_member ON evaluation_handovers(member_id);
  `)

  migrate()
  seedDefaults()
}

// 既存DBへの後方互換マイグレーション（カラム追加）
function migrate() {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
  const m = cols('members')
  if (!m.includes('plan_type')) db.exec("ALTER TABLE members ADD COLUMN plan_type TEXT DEFAULT 'ticket'")
  if (!m.includes('plan_name')) db.exec('ALTER TABLE members ADD COLUMN plan_name TEXT')
  if (!m.includes('counseling_notes')) db.exec('ALTER TABLE members ADD COLUMN counseling_notes TEXT')
  // 手動入力できる会員ID（表示・検索用）。内部の自動採番idはそのまま維持
  if (!m.includes('member_code')) db.exec('ALTER TABLE members ADD COLUMN member_code TEXT')
  const s = cols('sessions')
  if (!s.includes('usage_status')) db.exec('ALTER TABLE sessions ADD COLUMN usage_status TEXT')
  // セットごとの記録（1行=1セット）に対応する set_no 列。旧データは NULL のまま。
  const se = cols('session_exercises')
  if (!se.includes('set_no')) db.exec('ALTER TABLE session_exercises ADD COLUMN set_no INTEGER')

  migratePresetsV2()
}

// 種目プリセットの追加・削除（既存DBにも一度だけ適用）
function migratePresetsV2() {
  const done = db.prepare("SELECT value FROM settings WHERE key = 'presets_v2_done'").get()
  if (done && done.value === '1') return

  const add = [
    ['Dショルダープレス', '肩'], ['バックプレス', '肩'], ['Dバックプレス', '肩'],
    ['Dデッドリフト', '背中'], ['チンニング', '背中'], ['アシストチンニング', '背中'],
    ['シーテッドロウ', '背中'], ['バンドベントロウ', '背中'], ['Dベントロウ', '背中'],
    ['シールロウ', '背中'], ['インクラインベンチプレス', '胸'], ['Dベンチプレス', '胸'],
    ['Dインクラインベンチプレス', '胸'], ['ヒップリフト', '脚'], ['レッグカール', '脚'],
    ['Dサイドレイズ', '肩'], ['アップライトロウ', '肩'], ['Dリアレイズ', '肩'],
    ['フェイスプル', '肩'], ['トランポリン', '有酸素'], ['ケトルベル振り回し', '全身'],
    ['ももあげ', '有酸素'], ['バーピー', '全身'], ['ランジジャンプ', '脚'],
    ['SJ', '全身'], ['ロープ振り', '全身']
  ]
  const remove = ['レッグプレス', 'プランク']

  const tx = db.transaction(() => {
    const exists = db.prepare('SELECT COUNT(*) c FROM exercise_presets WHERE name = ?')
    const ins = db.prepare('INSERT INTO exercise_presets (name, category) VALUES (?, ?)')
    add.forEach((p) => { if (exists.get(p[0]).c === 0) ins.run(p[0], p[1]) })
    const del = db.prepare('DELETE FROM exercise_presets WHERE name = ?')
    remove.forEach((n) => del.run(n))
    db.prepare("INSERT INTO settings (key, value) VALUES ('presets_v2_done', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run()
  })
  tx()
}

// 初回のみ、種目プリセット等のデフォルトデータを投入
function seedDefaults() {
  const presetCount = db.prepare('SELECT COUNT(*) c FROM exercise_presets').get().c
  if (presetCount === 0) {
    const presets = [
      ['ベンチプレス', '胸'],
      ['スクワット', '脚'],
      ['デッドリフト', '背中'],
      ['ラットプルダウン', '背中'],
      ['ショルダープレス', '肩'],
      ['レッグプレス', '脚'],
      ['アームカール', '腕'],
      ['プランク', '腹']
    ]
    const ins = db.prepare('INSERT INTO exercise_presets (name, category) VALUES (?, ?)')
    const tx = db.transaction(() => presets.forEach((p) => ins.run(p[0], p[1])))
    tx()
  }

  const trainerCount = db.prepare('SELECT COUNT(*) c FROM trainers').get().c
  if (trainerCount === 0) {
    db.prepare('INSERT INTO trainers (name, active) VALUES (?, 1)').run('メイントレーナー')
  }

  const memberCount = db.prepare('SELECT COUNT(*) c FROM members').get().c
  if (memberCount === 0) {
    const ins = db.prepare(`INSERT INTO members
      (name, furigana, birthdate, gender, phone, email, joined_at, status, goal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const samples = [
      ['田中 太郎', 'タナカ タロウ', '1990-05-12', 'male', '090-1111-2222', 'tanaka@example.com', '2025-01-10', 'active', '減量5kg'],
      ['鈴木 花子', 'スズキ ハナコ', '1995-08-22', 'female', '080-3333-4444', 'suzuki@example.com', '2025-03-01', 'active', '筋力アップ'],
      ['谷中 健', 'ヤナカ ケン', '1988-12-03', 'male', '070-5555-6666', '', '2024-11-20', 'paused', '体力維持']
    ]
    const tx = db.transaction(() => samples.forEach((s) => ins.run(...s)))
    tx()
  }
}

function getDb() {
  if (!db) throw new Error('DB not initialized')
  return db
}

module.exports = {
  initDb, getDb, getDbPath, closeDb,
  getSyncStatus, writeSyncConfig, syncNow
}
