const { ipcMain, dialog, app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { getDb, getDbPath } = require('./db')

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
      (name, furigana, birthdate, gender, phone, email, joined_at, status, goal, health_notes, notes, plan_type, plan_name, counseling_notes, member_code)
      VALUES (@name, @furigana, @birthdate, @gender, @phone, @email, @joined_at, @status, @goal, @health_notes, @notes, @plan_type, @plan_name, @counseling_notes, @member_code)`)
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
      plan_type=@plan_type, plan_name=@plan_name, counseling_notes=@counseling_notes,
      member_code=@member_code,
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

  // マルチ展開用：指定IDの会員にカード表示用情報（残回数・前回来店日・前回メモ）を付与
  ipcMain.handle('members:cards', (_e, ids = []) => {
    const db = getDb()
    if (!Array.isArray(ids) || ids.length === 0) return []
    const get = db.prepare('SELECT * FROM members WHERE id = ?')
    const rem = db.prepare('SELECT COALESCE(SUM(remaining_count),0) AS r FROM tickets WHERE member_id = ?')
    const last = db.prepare('SELECT id, session_date, next_memo FROM sessions WHERE member_id = ? ORDER BY session_date DESC, id DESC LIMIT 1')
    const lastEx = db.prepare('SELECT exercise_name, weight_kg, sets, reps FROM session_exercises WHERE session_id = ? ORDER BY order_index')
    const recent3 = db.prepare('SELECT id, session_date FROM sessions WHERE member_id = ? ORDER BY session_date DESC, id DESC LIMIT 3')
    const sessMuscles = db.prepare('SELECT muscle_name FROM session_muscles WHERE session_id = ?')
    const exLine = (e) => {
      const parts = [e.exercise_name]
      if (e.weight_kg != null) parts.push(`${e.weight_kg}kg`)
      const sr = []
      if (e.sets != null) sr.push(`${e.sets}セット`)
      if (e.reps != null) sr.push(`${e.reps}回`)
      return parts.join(' ') + (sr.length ? ` ${sr.join('×')}` : '')
    }
    return ids.map((id) => {
      const m = get.get(id)
      if (!m) return null
      const l = last.get(id)
      const recent = recent3.all(id).map((r) => ({
        date: r.session_date,
        muscles: sessMuscles.all(r.id).map((x) => x.muscle_name),
        menu: lastEx.all(r.id).map(exLine)
      }))
      let lastMenu = []
      if (l) {
        lastMenu = lastEx.all(l.id).map((e) => {
          const parts = [e.exercise_name]
          if (e.weight_kg != null) parts.push(`${e.weight_kg}kg`)
          const sr = []
          if (e.sets != null) sr.push(`${e.sets}セット`)
          if (e.reps != null) sr.push(`${e.reps}回`)
          return parts.join(' ') + (sr.length ? ` ${sr.join('×')}` : '')
        })
      }
      return {
        ...m,
        remaining_count: rem.get(id).r,
        last_visit: l ? l.session_date : null,
        last_next_memo: l ? l.next_memo : null,
        last_menu: lastMenu,
        recent
      }
    }).filter(Boolean)
  })

  // マスタ（トレーナー・種目プリセット）
  ipcMain.handle('trainers:list', () =>
    getDb().prepare('SELECT * FROM trainers WHERE active = 1 ORDER BY name').all())
  ipcMain.handle('presets:list', () =>
    getDb().prepare('SELECT * FROM exercise_presets ORDER BY category, name').all())

  registerTicketIpc()
  registerSessionIpc()
  registerDailyIpc()
  registerStatsIpc()
  registerSettingsIpc()
  registerBackupIpc()
  registerExcelIpc()
}

/* ===================== 設定・マスタ編集 ===================== */
function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => {
    const rows = getDb().prepare('SELECT key, value FROM settings').all()
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  })
  ipcMain.handle('settings:set', (_e, { key, value }) => {
    getDb().prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value ?? null)
    return { ok: true }
  })

  // トレーナー編集
  ipcMain.handle('trainers:create', (_e, name) => {
    const info = getDb().prepare('INSERT INTO trainers (name, active) VALUES (?, 1)').run(name)
    return getDb().prepare('SELECT * FROM trainers WHERE id = ?').get(info.lastInsertRowid)
  })
  ipcMain.handle('trainers:update', (_e, { id, name, active }) => {
    getDb().prepare('UPDATE trainers SET name = ?, active = ? WHERE id = ?').run(name, active ? 1 : 0, id)
    return { ok: true }
  })
  ipcMain.handle('trainers:delete', (_e, id) => {
    getDb().prepare('DELETE FROM trainers WHERE id = ?').run(id)
    return { ok: true }
  })

  // 種目プリセット編集
  ipcMain.handle('presets:create', (_e, { name, category }) => {
    const info = getDb().prepare('INSERT INTO exercise_presets (name, category) VALUES (?, ?)').run(name, category ?? null)
    return getDb().prepare('SELECT * FROM exercise_presets WHERE id = ?').get(info.lastInsertRowid)
  })
  ipcMain.handle('presets:update', (_e, { id, name, category }) => {
    getDb().prepare('UPDATE exercise_presets SET name = ?, category = ? WHERE id = ?').run(name, category ?? null, id)
    return { ok: true }
  })
  ipcMain.handle('presets:delete', (_e, id) => {
    getDb().prepare('DELETE FROM exercise_presets WHERE id = ?').run(id)
    return { ok: true }
  })
}

/* ===================== バックアップ ===================== */
function registerBackupIpc() {
  // SQLiteファイルを任意の場所へエクスポート（VACUUM INTOで一貫性を担保）
  ipcMain.handle('backup:export', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const ts = new Date().toISOString().slice(0, 10)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'バックアップの保存',
      defaultPath: `gymkarte-backup-${ts}.db`,
      filters: [{ name: 'SQLite DB', extensions: ['db'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      getDb().exec(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`)
      return { ok: true, path: filePath }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // バックアップを復元（選択ファイルで現DBを置換）。要再起動。
  ipcMain.handle('backup:import', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'バックアップの復元',
      properties: ['openFile'],
      filters: [{ name: 'SQLite DB', extensions: ['db'] }]
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    const confirm = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['キャンセル', '復元して再起動'], defaultId: 1, cancelId: 0,
      message: '現在のデータを上書きします', detail: '復元するとアプリを再起動します。現在のデータは失われます。よろしいですか？'
    })
    if (confirm.response !== 1) return { ok: false, canceled: true }
    try {
      const dest = getDbPath()
      // WAL関連ファイルを掃除してから上書き
      for (const ext of ['', '-wal', '-shm']) {
        const f = dest + ext
        if (fs.existsSync(f)) fs.unlinkSync(f)
      }
      fs.copyFileSync(filePaths[0], dest)
      app.relaunch()
      app.exit(0)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
}

/* ===================== Excelインポート ===================== */
function registerExcelIpc() {
  // ファイル選択→パースして列名・全行・プレビューを返す
  ipcMain.handle('excel:open', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'インポートするファイルを選択',
      properties: ['openFile'],
      filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }]
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    let xlsx
    try { xlsx = require('xlsx') } catch (e) {
      return { ok: false, error: 'xlsxパッケージが見つかりません。`npm install` を実行してください。' }
    }
    try {
      const wb = xlsx.readFile(filePaths[0], { cellDates: true })
      const sheetName = wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows = xlsx.utils.sheet_to_json(ws, { defval: '', raw: false })
      const columns = rows.length ? Object.keys(rows[0]) : []
      return { ok: true, fileName: path.basename(filePaths[0]), sheetName, columns, rows, total: rows.length, preview: rows.slice(0, 10) }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // マッピングに従って一括INSERT。バリデーション後、エラー行はスキップしてログ返却
  ipcMain.handle('excel:import', (_e, { rows, mapping }) => {
    const db = getDb()
    const FIELDS = ['name', 'furigana', 'birthdate', 'gender', 'phone', 'email', 'joined_at', 'status', 'goal', 'health_notes', 'notes']
    const log = { success: 0, skipped: 0, errors: [] }

    const insMember = db.prepare(`INSERT INTO members
      (name, furigana, birthdate, gender, phone, email, joined_at, status, goal, health_notes, notes)
      VALUES (@name, @furigana, @birthdate, @gender, @phone, @email, @joined_at, @status, @goal, @health_notes, @notes)`)
    const insTicket = db.prepare(`INSERT INTO tickets (member_id, purchased_at, total_count, remaining_count, expires_at)
      VALUES (?, date('now','localtime'), ?, ?, ?)`)

    const tx = db.transaction(() => {
      rows.forEach((row, i) => {
        const rowNo = i + 2 // ヘッダー行を除いた実Excel行番号
        const rec = {}
        for (const f of FIELDS) {
          const col = mapping[f]
          rec[f] = col && row[col] != null && row[col] !== '' ? String(row[col]).trim() : null
        }
        // 必須：氏名
        if (!rec.name) { log.skipped++; log.errors.push({ row: rowNo, reason: '氏名が空です' }); return }
        // 日付正規化
        const bd = normalizeDate(rec.birthdate)
        if (rec.birthdate && !bd) { log.skipped++; log.errors.push({ row: rowNo, reason: `生年月日の形式が不正: ${rec.birthdate}` }); return }
        rec.birthdate = bd
        const jd = normalizeDate(rec.joined_at)
        if (rec.joined_at && !jd) { log.skipped++; log.errors.push({ row: rowNo, reason: `入会日の形式が不正: ${rec.joined_at}` }); return }
        rec.joined_at = jd
        rec.status = normalizeStatus(rec.status)
        rec.gender = normalizeGender(rec.gender)

        try {
          const info = insMember.run(rec)
          // 回数券（残回数・有効期限）が指定されていれば作成
          const remStr = mapping.remaining_count && row[mapping.remaining_count]
          const rem = remStr != null && remStr !== '' ? parseInt(remStr, 10) : null
          if (rem != null && !isNaN(rem)) {
            const exp = normalizeDate(mapping.expires_at ? row[mapping.expires_at] : null)
            insTicket.run(info.lastInsertRowid, rem, rem, exp)
          }
          log.success++
        } catch (err) {
          log.skipped++
          log.errors.push({ row: rowNo, reason: err.message })
        }
      })
    })
    tx()
    return log
  })
}

function normalizeDate(v) {
  if (!v) return null
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`
  const d = new Date(s)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  return null
}
function pad2(n) { return String(n).padStart(2, '0') }

function normalizeStatus(v) {
  if (!v) return 'active'
  const s = String(v).trim()
  if (/解約/.test(s) || /cancel/i.test(s)) return 'cancelled'
  if (/休/.test(s) || /paus/i.test(s)) return 'paused'
  if (/退/.test(s) || /withdraw/i.test(s)) return 'withdrawn'
  return 'active'
}
function normalizeGender(v) {
  if (!v) return null
  const s = String(v).trim()
  if (/男|male|m/i.test(s)) return 'male'
  if (/女|female|f/i.test(s)) return 'female'
  return 'other'
}

/* ===================== 統計（ダッシュボード・分析） ===================== */
function registerStatsIpc() {
  // ダッシュボード集計
  ipcMain.handle('stats:dashboard', () => {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)

    const totalMembers = db.prepare('SELECT COUNT(*) c FROM members').get().c
    const activeMembers = db.prepare("SELECT COUNT(*) c FROM members WHERE status = 'active'").get().c

    // 本日のセッション（来店済み）
    const todayVisits = db.prepare(`
      SELECT s.id, s.session_date, s.trainer_name, s.participant_count, m.id AS member_id, m.name
      FROM sessions s JOIN members m ON m.id = s.member_id
      WHERE substr(s.session_date,1,10) = ?
      ORDER BY s.session_date DESC`).all(today)

    // 残回数アラート（残3回以下・アクティブ会員のみ）
    const lowTickets = db.prepare(`
      SELECT * FROM (
        SELECT m.id, m.name, m.furigana,
          COALESCE((SELECT SUM(remaining_count) FROM tickets t WHERE t.member_id = m.id),0) AS remaining
        FROM members m
        WHERE m.status = 'active' AND COALESCE(m.plan_type,'ticket') = 'ticket'
      ) WHERE remaining <= 2
      ORDER BY remaining ASC`).all()

    // 直近7日間の来店数
    const week = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().slice(0, 10)
      const c = db.prepare('SELECT COUNT(*) c FROM sessions WHERE substr(session_date,1,10) = ?').get(ds).c
      week.push({ date: ds, label: `${d.getMonth() + 1}/${d.getDate()}`, count: c })
    }

    return { totalMembers, activeMembers, todayVisits, lowTickets, week, today }
  })

  // 会員別 分析データ
  ipcMain.handle('stats:memberAnalytics', (_e, memberId) => {
    const db = getDb()

    // 月別来店回数（直近12ヶ月）
    const monthly = db.prepare(`
      SELECT substr(session_date,1,7) AS ym, COUNT(*) c
      FROM sessions WHERE member_id = ? AND session_date IS NOT NULL
      GROUP BY ym ORDER BY ym`).all(memberId)

    // 部位割合
    const muscles = db.prepare(`
      SELECT sm.muscle_name AS name, COUNT(*) value
      FROM session_muscles sm JOIN sessions s ON s.id = sm.session_id
      WHERE s.member_id = ?
      GROUP BY sm.muscle_name ORDER BY value DESC`).all(memberId)

    // 種目別の重量推移
    const exRows = db.prepare(`
      SELECT se.exercise_name, se.weight_kg, s.session_date
      FROM session_exercises se JOIN sessions s ON s.id = se.session_id
      WHERE s.member_id = ? AND se.weight_kg IS NOT NULL AND s.session_date IS NOT NULL
      ORDER BY s.session_date`).all(memberId)
    const exercises = {}
    for (const r of exRows) {
      if (!exercises[r.exercise_name]) exercises[r.exercise_name] = []
      exercises[r.exercise_name].push({ date: r.session_date.slice(0, 10), weight: r.weight_kg })
    }

    // 体重・体脂肪推移（日次カルテ）
    const body = db.prepare(`
      SELECT log_date AS date, weight_kg, body_fat_pct
      FROM daily_logs
      WHERE member_id = ? AND (weight_kg IS NOT NULL OR body_fat_pct IS NOT NULL)
      ORDER BY log_date`).all(memberId)

    // 総来店回数・平均ペース
    const totalVisits = db.prepare('SELECT COUNT(*) c FROM sessions WHERE member_id = ?').get(memberId).c
    const range = db.prepare('SELECT MIN(session_date) a, MAX(session_date) b FROM sessions WHERE member_id = ?').get(memberId)
    let avgPerWeek = null
    if (range.a && range.b && totalVisits > 1) {
      const days = Math.max(1, (new Date(range.b) - new Date(range.a)) / 86400000)
      avgPerWeek = +(totalVisits / (days / 7)).toFixed(1)
    }

    return { monthly, muscles, exercises, body, totalVisits, avgPerWeek, firstVisit: range.a, lastVisit: range.b }
  })
}

/* ===================== 回数券 ===================== */
function registerTicketIpc() {
  // 会員の回数券一覧（新しい順）
  ipcMain.handle('tickets:list', (_e, memberId) =>
    getDb().prepare('SELECT * FROM tickets WHERE member_id = ? ORDER BY purchased_at DESC, id DESC').all(memberId))

  // 会員の合計残回数
  ipcMain.handle('tickets:remaining', (_e, memberId) =>
    getDb().prepare('SELECT COALESCE(SUM(remaining_count),0) AS remaining FROM tickets WHERE member_id = ?').get(memberId).remaining)

  // 新規購入。残回数=購入枚数で初期化
  ipcMain.handle('tickets:create', (_e, d) => {
    const db = getDb()
    const total = Number(d.total_count) || 0
    const info = db.prepare(`INSERT INTO tickets
      (member_id, purchased_at, total_count, remaining_count, expires_at, price, notes)
      VALUES (@member_id, @purchased_at, @total_count, @remaining_count, @expires_at, @price, @notes)`)
      .run({
        member_id: d.member_id,
        purchased_at: d.purchased_at ?? null,
        total_count: total,
        remaining_count: d.remaining_count != null ? Number(d.remaining_count) : total,
        expires_at: d.expires_at ?? null,
        price: d.price != null ? Number(d.price) : null,
        notes: d.notes ?? null
      })
    return db.prepare('SELECT * FROM tickets WHERE id = ?').get(info.lastInsertRowid)
  })

  // 回数券更新（残回数の手動調整など）
  ipcMain.handle('tickets:update', (_e, d) => {
    const db = getDb()
    db.prepare(`UPDATE tickets SET
      purchased_at=@purchased_at, total_count=@total_count, remaining_count=@remaining_count,
      expires_at=@expires_at, price=@price, notes=@notes WHERE id=@id`).run({
      id: d.id,
      purchased_at: d.purchased_at ?? null,
      total_count: Number(d.total_count) || 0,
      remaining_count: Number(d.remaining_count) || 0,
      expires_at: d.expires_at ?? null,
      price: d.price != null ? Number(d.price) : null,
      notes: d.notes ?? null
    })
    return db.prepare('SELECT * FROM tickets WHERE id = ?').get(d.id)
  })

  ipcMain.handle('tickets:delete', (_e, id) => {
    getDb().prepare('DELETE FROM tickets WHERE id = ?').run(id)
    return { ok: true }
  })
}

// 残回数のある最も古い（有効期限が近い）回数券を返す
function pickActiveTicket(db, memberId) {
  return db.prepare(`SELECT * FROM tickets
    WHERE member_id = ? AND remaining_count > 0
    ORDER BY (expires_at IS NULL), expires_at ASC, id ASC LIMIT 1`).get(memberId)
}

/* ===================== セッション ===================== */
function registerSessionIpc() {
  // 会員のセッション一覧（新規登録は下へ追加していくため日付昇順）
  // 各カルテに部位・メニュー・利用状況・該当日の日次カルテを付与
  ipcMain.handle('sessions:list', (_e, memberId) => {
    const db = getDb()
    const sessions = db.prepare('SELECT * FROM sessions WHERE member_id = ? ORDER BY session_date ASC, id ASC').all(memberId)
    const mStmt = db.prepare('SELECT muscle_name FROM session_muscles WHERE session_id = ?')
    const eStmt = db.prepare('SELECT * FROM session_exercises WHERE session_id = ? ORDER BY order_index')
    const dStmt = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND log_date = ?')
    return sessions.map((s) => {
      const muscles = mStmt.all(s.id).map((r) => r.muscle_name)
      const exercises = eStmt.all(s.id)
      return {
        ...s,
        muscles,
        exercises,
        menu: exercises.map((e) => e.exercise_name),
        daily: s.session_date ? dStmt.get(memberId, String(s.session_date).slice(0, 10)) || null : null
      }
    })
  })

  // 新規セッション作成。回数券消費（自動減算）をトランザクションで実行
  ipcMain.handle('sessions:create', (_e, d) => {
    const db = getDb()
    const tx = db.transaction((data) => {
      let ticketId = data.ticket_id ?? null
      const consume = data.consume_ticket !== false // デフォルト消費
      if (consume) {
        const t = ticketId
          ? db.prepare('SELECT * FROM tickets WHERE id = ? AND remaining_count > 0').get(ticketId)
          : pickActiveTicket(db, data.member_id)
        if (t) {
          db.prepare('UPDATE tickets SET remaining_count = remaining_count - 1 WHERE id = ?').run(t.id)
          ticketId = t.id
        }
      }
      const info = db.prepare(`INSERT INTO sessions
        (member_id, ticket_id, session_date, participant_count, trainer_name, coach_comment, next_memo, usage_status)
        VALUES (@member_id, @ticket_id, @session_date, @participant_count, @trainer_name, @coach_comment, @next_memo, @usage_status)`)
        .run({
          member_id: data.member_id,
          ticket_id: ticketId,
          session_date: data.session_date ?? null,
          participant_count: Number(data.participant_count) || 1,
          trainer_name: data.trainer_name ?? null,
          coach_comment: data.coach_comment ?? null,
          next_memo: data.next_memo ?? null,
          usage_status: data.usage_status ?? null
        })
      const sid = info.lastInsertRowid
      insertMuscles(db, sid, data.muscles)
      insertExercises(db, sid, menuToExercises(data))
      upsertDailyFromSession(db, data)
      return sid
    })
    const sid = tx(d)
    return getSessionFull(db, sid)
  })

  // セッション更新。部位・種目は洗い替え。回数券消費の差分も調整
  ipcMain.handle('sessions:update', (_e, d) => {
    const db = getDb()
    const tx = db.transaction((data) => {
      const prev = db.prepare('SELECT * FROM sessions WHERE id = ?').get(data.id)
      const prevConsumed = prev && prev.ticket_id != null
      let ticketId = data.ticket_id ?? null
      const consume = data.consume_ticket !== false
      if (consume && !prevConsumed) {
        const t = ticketId
          ? db.prepare('SELECT * FROM tickets WHERE id = ? AND remaining_count > 0').get(ticketId)
          : pickActiveTicket(db, data.member_id)
        if (t) {
          db.prepare('UPDATE tickets SET remaining_count = remaining_count - 1 WHERE id = ?').run(t.id)
          ticketId = t.id
        }
      } else if (!consume && prevConsumed) {
        // 消費を取り消す：元の券に1回戻す
        db.prepare('UPDATE tickets SET remaining_count = remaining_count + 1 WHERE id = ?').run(prev.ticket_id)
        ticketId = null
      } else if (consume && prevConsumed) {
        ticketId = prev.ticket_id
      }
      db.prepare(`UPDATE sessions SET
        ticket_id=@ticket_id, session_date=@session_date, participant_count=@participant_count,
        trainer_name=@trainer_name, coach_comment=@coach_comment, next_memo=@next_memo, usage_status=@usage_status WHERE id=@id`).run({
        id: data.id,
        ticket_id: ticketId,
        session_date: data.session_date ?? null,
        participant_count: Number(data.participant_count) || 1,
        trainer_name: data.trainer_name ?? null,
        coach_comment: data.coach_comment ?? null,
        next_memo: data.next_memo ?? null,
        usage_status: data.usage_status ?? null
      })
      db.prepare('DELETE FROM session_muscles WHERE session_id = ?').run(data.id)
      db.prepare('DELETE FROM session_exercises WHERE session_id = ?').run(data.id)
      insertMuscles(db, data.id, data.muscles)
      insertExercises(db, data.id, menuToExercises(data))
      upsertDailyFromSession(db, data)
      return data.id
    })
    tx(d)
    return getSessionFull(db, d.id)
  })

  // 削除。消費していた回数券を1回戻す
  ipcMain.handle('sessions:delete', (_e, id) => {
    const db = getDb()
    const tx = db.transaction((sid) => {
      const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid)
      if (s && s.ticket_id != null) {
        db.prepare('UPDATE tickets SET remaining_count = remaining_count + 1 WHERE id = ?').run(s.ticket_id)
      }
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sid)
    })
    tx(id)
    return { ok: true }
  })
}

function insertMuscles(db, sid, muscles) {
  if (!Array.isArray(muscles)) return
  const ins = db.prepare('INSERT INTO session_muscles (session_id, muscle_name) VALUES (?, ?)')
  muscles.forEach((m) => ins.run(sid, m))
}

function insertExercises(db, sid, exercises) {
  if (!Array.isArray(exercises)) return
  const ins = db.prepare(`INSERT INTO session_exercises
    (session_id, exercise_name, weight_kg, sets, reps, order_index) VALUES (?, ?, ?, ?, ?, ?)`)
  exercises.forEach((ex, i) => {
    if (!ex || !ex.exercise_name) return
    ins.run(sid, ex.exercise_name,
      ex.weight_kg != null && ex.weight_kg !== '' ? Number(ex.weight_kg) : null,
      ex.sets != null && ex.sets !== '' ? Number(ex.sets) : null,
      ex.reps != null && ex.reps !== '' ? Number(ex.reps) : null,
      i)
  })
}

function getSessionFull(db, sid) {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid)
  if (!s) return null
  s.muscles = db.prepare('SELECT muscle_name FROM session_muscles WHERE session_id = ?').all(sid).map((r) => r.muscle_name)
  s.exercises = db.prepare('SELECT * FROM session_exercises WHERE session_id = ? ORDER BY order_index').all(sid)
  s.menu = s.exercises.map((e) => e.exercise_name)
  if (s.session_date) s.daily = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND log_date = ?').get(s.member_id, String(s.session_date).slice(0, 10)) || null
  return s
}

// メニュー（種目名の配列）を session_exercises 形式に変換。従来の exercises 形式も許容
function menuToExercises(data) {
  if (Array.isArray(data.exercises)) return data.exercises
  if (Array.isArray(data.menu)) return data.menu.filter((n) => n && String(n).trim()).map((n) => ({ exercise_name: n }))
  return []
}

// セッションに紐づく日次カルテ（体調・コメント等）を該当日のdaily_logsへupsert
function upsertDailyFromSession(db, data) {
  const dy = data.daily
  if (!dy || !data.session_date) return
  const date = String(data.session_date).slice(0, 10)
  const has = ['weight_kg', 'body_fat_pct', 'condition_score', 'sleep_hours', 'sleep_quality_score', 'meal_notes', 'water_ml', 'member_comment', 'trainer_note']
    .some((k) => dy[k] != null && dy[k] !== '')
  if (!has) return
  const fields = {
    member_id: data.member_id, log_date: date,
    weight_kg: numOrNull(dy.weight_kg), body_fat_pct: numOrNull(dy.body_fat_pct),
    condition_score: numOrNull(dy.condition_score), sleep_hours: numOrNull(dy.sleep_hours),
    sleep_quality_score: numOrNull(dy.sleep_quality_score), meal_notes: dy.meal_notes ?? null,
    water_ml: numOrNull(dy.water_ml), member_comment: dy.member_comment ?? null, trainer_note: dy.trainer_note ?? null
  }
  const ex = db.prepare('SELECT id FROM daily_logs WHERE member_id = ? AND log_date = ?').get(data.member_id, date)
  if (ex) {
    db.prepare(`UPDATE daily_logs SET weight_kg=@weight_kg, body_fat_pct=@body_fat_pct, condition_score=@condition_score,
      sleep_hours=@sleep_hours, sleep_quality_score=@sleep_quality_score, meal_notes=@meal_notes, water_ml=@water_ml,
      member_comment=@member_comment, trainer_note=@trainer_note, updated_at=datetime('now','localtime') WHERE id=@id`).run({ ...fields, id: ex.id })
  } else {
    db.prepare(`INSERT INTO daily_logs (member_id, log_date, weight_kg, body_fat_pct, condition_score, sleep_hours,
      sleep_quality_score, meal_notes, water_ml, member_comment, trainer_note)
      VALUES (@member_id, @log_date, @weight_kg, @body_fat_pct, @condition_score, @sleep_hours,
      @sleep_quality_score, @meal_notes, @water_ml, @member_comment, @trainer_note)`).run(fields)
  }
}

/* ===================== 日次カルテ ===================== */
function registerDailyIpc() {
  ipcMain.handle('daily:list', (_e, memberId) =>
    getDb().prepare('SELECT * FROM daily_logs WHERE member_id = ? ORDER BY log_date DESC, id DESC').all(memberId))

  ipcMain.handle('daily:get', (_e, { member_id, log_date }) =>
    getDb().prepare('SELECT * FROM daily_logs WHERE member_id = ? AND log_date = ?').get(member_id, log_date))

  // 同一日付があればUPDATE、なければINSERT（upsert）
  ipcMain.handle('daily:save', (_e, d) => {
    const db = getDb()
    const fields = {
      member_id: d.member_id,
      log_date: d.log_date,
      weight_kg: numOrNull(d.weight_kg),
      body_fat_pct: numOrNull(d.body_fat_pct),
      condition_score: numOrNull(d.condition_score),
      sleep_hours: numOrNull(d.sleep_hours),
      sleep_quality_score: numOrNull(d.sleep_quality_score),
      meal_notes: d.meal_notes ?? null,
      water_ml: numOrNull(d.water_ml),
      member_comment: d.member_comment ?? null,
      trainer_note: d.trainer_note ?? null
    }
    const existing = db.prepare('SELECT id FROM daily_logs WHERE member_id = ? AND log_date = ?').get(d.member_id, d.log_date)
    if (existing) {
      db.prepare(`UPDATE daily_logs SET
        weight_kg=@weight_kg, body_fat_pct=@body_fat_pct, condition_score=@condition_score,
        sleep_hours=@sleep_hours, sleep_quality_score=@sleep_quality_score, meal_notes=@meal_notes,
        water_ml=@water_ml, member_comment=@member_comment, trainer_note=@trainer_note,
        updated_at=datetime('now','localtime') WHERE id=@id`).run({ ...fields, id: existing.id })
      return db.prepare('SELECT * FROM daily_logs WHERE id = ?').get(existing.id)
    }
    const info = db.prepare(`INSERT INTO daily_logs
      (member_id, log_date, weight_kg, body_fat_pct, condition_score, sleep_hours,
       sleep_quality_score, meal_notes, water_ml, member_comment, trainer_note)
      VALUES (@member_id, @log_date, @weight_kg, @body_fat_pct, @condition_score, @sleep_hours,
       @sleep_quality_score, @meal_notes, @water_ml, @member_comment, @trainer_note)`).run(fields)
    return db.prepare('SELECT * FROM daily_logs WHERE id = ?').get(info.lastInsertRowid)
  })

  ipcMain.handle('daily:delete', (_e, id) => {
    getDb().prepare('DELETE FROM daily_logs WHERE id = ?').run(id)
    return { ok: true }
  })
}

function numOrNull(v) {
  return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : null
}

// undefinedをnullに揃え、欠損フィールドを補完
function normalizeMember(d) {
  const fields = ['name', 'furigana', 'birthdate', 'gender', 'phone', 'email', 'joined_at', 'status', 'goal', 'health_notes', 'notes', 'plan_type', 'plan_name', 'counseling_notes', 'member_code']
  const out = {}
  for (const f of fields) out[f] = d[f] ?? null
  if (!out.status) out.status = 'active'
  if (!out.plan_type) out.plan_type = 'ticket'
  // 会員IDは空文字ならnullに揃える
  if (out.member_code != null && String(out.member_code).trim() === '') out.member_code = null
  return out
}

module.exports = { registerIpc }
