const { ipcMain } = require('electron')
const { getDb } = require('./db')

// レンダラーから呼ばれるDB操作をIPCハンドラとして登録
function registerIpc() {
  // 会員一覧（ステータスフィルタ任意）。残回数と最終来店日も付与
  ipcMain.handle('members:list', (_e, { status } = {}) => {
    const db = getDb()
    let sql = `
      SELECT m.*,
        COALESCE((SELECT SUM(remaining_count) FROM tickets t WHERE t.member_id = m.id), 0) AS remaining_count,
        (SELECT MAX(session_date) FROM sessions s WHERE s.member_id = m.id) AS last_visit
      FROM members m
    `
    const params = []
    if (status && status !== 'all') {
      sql += ' WHERE m.status = ?'
      params.push(status)
    }
    sql += ' ORDER BY m.furigana, m.name'
    return db.prepare(sql).all(...params)
  })

  // 単一会員取得
  ipcMain.handle('members:get', (_e, id) => {
    const db = getDb()
    return db.prepare('SELECT * FROM members WHERE id = ?').get(id)
  })

  // 新規作成
  ipcMain.handle('members:create', (_e, data) => {
    const db = getDb()
    const stmt = db.prepare(`INSERT INTO members
      (name, furigana, birthdate, gender, phone, email, joined_at, status, goal, health_notes, notes)
      VALUES (@name, @furigana, @birthdate, @gender, @phone, @email, @joined_at, @status, @goal, @health_notes, @notes)`)
    const info = stmt.run(normalizeMember(data))
    return db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid)
  })

  // 更新
  ipcMain.handle('members:update', (_e, data) => {
    const db = getDb()
    const stmt = db.prepare(`UPDATE members SET
      name=@name, furigana=@furigana, birthdate=@birthdate, gender=@gender,
      phone=@phone, email=@email, joined_at=@joined_at, status=@status,
      goal=@goal, health_notes=@health_notes, notes=@notes,
      updated_at=datetime('now','localtime')
      WHERE id=@id`)
    stmt.run({ ...normalizeMember(data), id: data.id })
    return db.prepare('SELECT * FROM members WHERE id = ?').get(data.id)
  })

  // 削除
  ipcMain.handle('members:delete', (_e, id) => {
    getDb().prepare('DELETE FROM members WHERE id = ?').run(id)
    return { ok: true }
  })

  // マスタ（トレーナー・種目プリセット）
  ipcMain.handle('trainers:list', () =>
    getDb().prepare('SELECT * FROM trainers WHERE active = 1 ORDER BY name').all())
  ipcMain.handle('presets:list', () =>
    getDb().prepare('SELECT * FROM exercise_presets ORDER BY category, name').all())
}

// undefinedをnullに揃え、欠損フィールドを補完
function normalizeMember(d) {
  const fields = ['name', 'furigana', 'birthdate', 'gender', 'phone', 'email', 'joined_at', 'status', 'goal', 'health_notes', 'notes']
  const out = {}
  for (const f of fields) out[f] = d[f] ?? null
  if (!out.status) out.status = 'active'
  return out
}

module.exports = { registerIpc }
