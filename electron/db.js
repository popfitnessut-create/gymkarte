const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

let db = null
let currentDbPath = null

// DBファイルの保存先（userData配下）を初期化してスキーマを作成する
function initDb(userDataPath) {
  const dir = path.join(userDataPath, 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'gymkarte.db')
  currentDbPath = dbPath

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createSchema()
  return dbPath
}

function getDbPath() { return currentDbPath }

// バックアップ復元用：現DBを閉じて別ファイルで開き直す前のクローズ
function closeDb() {
  if (db) { db.close(); db = null }
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

    CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_member ON tickets(member_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);
    CREATE INDEX IF NOT EXISTS idx_daily_member ON daily_logs(member_id);
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
  const s = cols('sessions')
  if (!s.includes('usage_status')) db.exec('ALTER TABLE sessions ADD COLUMN usage_status TEXT')

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

module.exports = { initDb, getDb, getDbPath, closeDb }
