const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

let db = null

// DBファイルの保存先（userData配下）を初期化してスキーマを作成する
function initDb(userDataPath) {
  const dir = path.join(userDataPath, 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'gymkarte.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createSchema()
  return dbPath
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

    CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_member ON tickets(member_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);
    CREATE INDEX IF NOT EXISTS idx_daily_member ON daily_logs(member_id);
  `)

  seedDefaults()
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

module.exports = { initDb, getDb }
