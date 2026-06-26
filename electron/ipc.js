const { ipcMain, dialog, app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { getDb, getDbPath, getSyncStatus, writeSyncConfig, syncNow } = require('./db')

// レンダラーから呼ばれるDB操作をIPCハンドラとして登録
function registerIpc() {
  // 会員一覧（ステータスフィルタ任意）。残回数と最終来店日も付与
  ipcMain.handle('members:list', (_e, { status, sort, dir } = {}) => {
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
    // 昇順/降順（手動並び替えには適用しない）
    const d = dir === 'desc' ? 'DESC' : 'ASC'
    // 並び替え：会員ID順 / 登録順 / 手動 / フリガナ順（既定）
    // 会員ID順は数値として整列（"10" が "2" より後ろに来るよう CAST）。
    // 空の会員IDは常に末尾。CAST は数値で始まらない値を0扱いにするため、
    // 文字列の member_code もタイブレークに併用する。
    const ORDER = {
      code: ` ORDER BY (m.member_code IS NULL OR m.member_code = ''), CAST(m.member_code AS INTEGER) ${d}, m.member_code ${d}, m.id`,
      created: ` ORDER BY m.created_at ${d}, m.id`,
      manual: ' ORDER BY (m.sort_order IS NULL), m.sort_order, m.furigana, m.name',
      furigana: ` ORDER BY m.furigana ${d}, m.name`
    }
    sql += ORDER[sort] || ORDER.furigana
    return db.prepare(sql).all(...params)
  })

  // 手動並び替えの順序を保存（渡されたID配列の並び順を sort_order に書き込む）
  ipcMain.handle('members:reorder', (_e, ids = []) => {
    const db = getDb()
    if (!Array.isArray(ids) || ids.length === 0) return { ok: true }
    const upd = db.prepare('UPDATE members SET sort_order = ? WHERE id = ?')
    const tx = db.transaction((list) => {
      list.forEach((id, i) => upd.run(i, id))
    })
    tx(ids)
    return { ok: true }
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
    // 競合検知：他端末で先に更新されていれば上書きせず通知（同時編集対策）。
    // data.expected_updated_at にフォーム読込時の updated_at が入っている前提。
    // data.force === true なら検知を無視して上書き。
    if (data.expected_updated_at != null && !data.force) {
      const cur = db.prepare('SELECT updated_at FROM members WHERE id = ?').get(data.id)
      if (cur && cur.updated_at && cur.updated_at !== data.expected_updated_at) {
        return { conflict: true, current: db.prepare('SELECT * FROM members WHERE id = ?').get(data.id) }
      }
    }
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
    const lastEx = db.prepare('SELECT exercise_name, weight_kg, sets, reps, seconds, child_name, set_no FROM session_exercises WHERE session_id = ? ORDER BY order_index')
    const recent3 = db.prepare('SELECT id, session_date FROM sessions WHERE member_id = ? ORDER BY session_date DESC, id DESC LIMIT 3')
    const sessMuscles = db.prepare('SELECT muscle_name FROM session_muscles WHERE session_id = ?')
    // 種目（セット配列）を「ベンチプレス 60kg×10回」「プランク 60秒」「HIIT: バーピー 20kg×30秒」の形へ整形
    const exLineG = (e) => {
      const isHiit = String(e.exercise_name || '').toUpperCase() === 'HIIT'
      const segs = (e.sets || []).map((st) => {
        const p = []
        if (isHiit && st.child_name) p.push(st.child_name)
        if (st.weight_kg != null) p.push(`${st.weight_kg}kg`)
        if (st.reps != null) p.push(`${st.reps}回`)
        if (st.seconds != null) p.push(`${st.seconds}秒`)
        return p.join(isHiit ? ' ' : '×')
      }).filter(Boolean)
      if (isHiit) return e.exercise_name + (segs.length ? `: ${segs.join(', ')}` : '')
      return e.exercise_name + (segs.length ? ` ${segs.join(', ')}` : '')
    }
    const menuOf = (sid) => groupExercises(lastEx.all(sid)).map(exLineG)
    return ids.map((id) => {
      const m = get.get(id)
      if (!m) return null
      const l = last.get(id)
      const recent = recent3.all(id).map((r) => ({
        date: r.session_date,
        muscles: sessMuscles.all(r.id).map((x) => x.muscle_name),
        menu: menuOf(r.id)
      }))
      let lastMenu = []
      if (l) lastMenu = menuOf(l.id)
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

  // 新規会員の「会費ペイ 初回継続課金日変更」アラート対象（未対応の会員）
  ipcMain.handle('members:billingPending', () =>
    getDb().prepare(`SELECT id, name, furigana, member_code
      FROM members WHERE COALESCE(billing_setup_done, 0) = 0 AND status != 'withdrawn'
      ORDER BY created_at DESC, id DESC`).all())

  // 「変更済み」→ アラートを消す
  ipcMain.handle('members:setBillingDone', (_e, id) => {
    getDb().prepare('UPDATE members SET billing_setup_done = 1 WHERE id = ?').run(id)
    return { ok: true }
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
  registerSyncIpc()
  registerEvaluationIpc()
  registerProcedureIpc()
}

/* ===================== 評価シート ===================== */
function registerEvaluationIpc() {
  const sheetRecords = (db, sheetId) =>
    db.prepare('SELECT exercise_key, weight, reps, seconds, note FROM evaluation_records WHERE sheet_id = ?').all(sheetId)

  // 会員の発行済みシート一覧（発行月の降順）。各シートに種目記録を添付
  ipcMain.handle('evaluations:list', (_e, memberId) => {
    const db = getDb()
    const sheets = db.prepare('SELECT * FROM evaluation_sheets WHERE member_id = ? ORDER BY year_month DESC, id DESC').all(memberId)
    return sheets.map((s) => ({ ...s, records: sheetRecords(db, s.id) }))
  })

  // 単一シート取得（会員ID＋対象月）。無ければ null
  ipcMain.handle('evaluations:get', (_e, { member_id, year_month }) => {
    const db = getDb()
    const s = db.prepare('SELECT * FROM evaluation_sheets WHERE member_id = ? AND year_month = ?').get(member_id, year_month)
    if (!s) return null
    return { ...s, records: sheetRecords(db, s.id) }
  })

  // グラフ用：会員の全シートの種目記録を時系列（年月昇順）で返す
  // [{ year_month, exercise_key, weight, reps, seconds }]
  ipcMain.handle('evaluations:history', (_e, memberId) => {
    const db = getDb()
    return db.prepare(`
      SELECT es.year_month, er.exercise_key, er.weight, er.reps, er.seconds
      FROM evaluation_records er
      JOIN evaluation_sheets es ON es.id = er.sheet_id
      WHERE es.member_id = ?
      ORDER BY es.year_month ASC, er.id ASC`).all(memberId)
  })

  // 保存・発行（member_id + year_month で upsert）。種目記録は洗い替え。
  // feedback_positive はサーバ側でも必須チェック（空なら発行不可）。
  ipcMain.handle('evaluations:save', (_e, d) => {
    const db = getDb()
    const status = d.status === 'draft' ? 'draft' : 'issued'
    const positive = (d.feedback_positive ?? '').toString().trim()
    // 発行（issued）時のみ「必ず褒める欄」を必須に。下書き（draft）は空でも保存可。
    if (status === 'issued' && !positive) return { ok: false, error: 'feedback_positive_required' }
    if (!d.member_id || !d.year_month) return { ok: false, error: 'invalid_args' }

    const tx = db.transaction((data) => {
      const existing = db.prepare('SELECT id FROM evaluation_sheets WHERE member_id = ? AND year_month = ?')
        .get(data.member_id, data.year_month)
      let sheetId
      if (existing) {
        sheetId = existing.id
        db.prepare(`UPDATE evaluation_sheets SET
          issued_at=@issued_at, trainer_name=@trainer_name,
          feedback_positive=@feedback_positive, feedback_next=@feedback_next, mascot_note=@mascot_note,
          status=@status, updated_at=datetime('now','localtime') WHERE id=@id`).run({
          id: sheetId,
          issued_at: data.issued_at ?? new Date().toISOString(),
          trainer_name: data.trainer_name ?? null,
          feedback_positive: positive,
          feedback_next: data.feedback_next ?? null,
          mascot_note: data.mascot_note ?? null,
          status
        })
        db.prepare('DELETE FROM evaluation_records WHERE sheet_id = ?').run(sheetId)
      } else {
        const info = db.prepare(`INSERT INTO evaluation_sheets
          (member_id, year_month, issued_at, trainer_name, feedback_positive, feedback_next, mascot_note, status)
          VALUES (@member_id, @year_month, @issued_at, @trainer_name, @feedback_positive, @feedback_next, @mascot_note, @status)`)
          .run({
            member_id: data.member_id,
            year_month: data.year_month,
            issued_at: data.issued_at ?? new Date().toISOString(),
            trainer_name: data.trainer_name ?? null,
            feedback_positive: positive,
            feedback_next: data.feedback_next ?? null,
            mascot_note: data.mascot_note ?? null,
            status
          })
        sheetId = info.lastInsertRowid
      }

      const ins = db.prepare(`INSERT INTO evaluation_records
        (sheet_id, exercise_key, weight, reps, seconds, note) VALUES (?, ?, ?, ?, ?, ?)`)
      ;(Array.isArray(data.records) ? data.records : []).forEach((r) => {
        if (!r || !r.exercise_key) return
        const w = numOrNull(r.weight)
        const reps = numOrNull(r.reps)
        const sec = numOrNull(r.seconds)
        const note = r.note != null && String(r.note).trim() !== '' ? String(r.note) : null
        // 全項目空の種目はスキップ（データ点を作らない）
        if (w == null && reps == null && sec == null && note == null) return
        ins.run(sheetId, r.exercise_key, w, reps, sec, note)
      })
      return sheetId
    })
    const sheetId = tx(d)
    const s = db.prepare('SELECT * FROM evaluation_sheets WHERE id = ?').get(sheetId)
    return { ok: true, sheet: { ...s, records: sheetRecords(db, sheetId) } }
  })

  ipcMain.handle('evaluations:delete', (_e, id) => {
    getDb().prepare('DELETE FROM evaluation_sheets WHERE id = ?').run(id)
    return { ok: true }
  })

  // セッション記録（session_exercises）から、種目別・月別の代表値を集計して返す。
  // 評価シートの数値を手入力せず自動反映するための元データ。
  // 各 (種目, 月) について最大重量・最大回数を採用。
  // 戻り値: [{ name, ym, weight, reps }]（月昇順）
  ipcMain.handle('evaluations:performance', (_e, memberId) => {
    const db = getDb()
    return db.prepare(`
      SELECT se.exercise_name AS name, substr(s.session_date,1,7) AS ym,
             MAX(se.weight_kg) AS weight, MAX(se.reps) AS reps
      FROM session_exercises se
      JOIN sessions s ON s.id = se.session_id
      WHERE s.member_id = ? AND s.session_date IS NOT NULL
        AND se.exercise_name IS NOT NULL AND TRIM(se.exercise_name) <> ''
      GROUP BY se.exercise_name, ym
      ORDER BY ym ASC`).all(memberId)
  })

  // お渡し状況の取得（会員の全月分）
  ipcMain.handle('evaluations:handovers', (_e, memberId) =>
    getDb().prepare('SELECT year_month, status, recorded_at FROM evaluation_handovers WHERE member_id = ?').all(memberId))

  // お渡し状況の保存（upsert）。status: handed | not_handed | none
  ipcMain.handle('evaluations:setHandover', (_e, { member_id, year_month, status }) => {
    const allowed = ['handed', 'not_handed', 'none']
    if (!member_id || !year_month || !allowed.includes(status)) return { ok: false, error: 'invalid_args' }
    getDb().prepare(`INSERT INTO evaluation_handovers (member_id, year_month, status, recorded_at)
      VALUES (?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(member_id, year_month) DO UPDATE SET status = excluded.status, recorded_at = excluded.recorded_at`)
      .run(member_id, year_month, status)
    return { ok: true }
  })

  // お渡し状況の削除（誤操作の取り消し用）
  ipcMain.handle('evaluations:clearHandover', (_e, { member_id, year_month }) => {
    getDb().prepare('DELETE FROM evaluation_handovers WHERE member_id = ? AND year_month = ?').run(member_id, year_month)
    return { ok: true }
  })

  // 印刷/お渡しリマインダ。月末2日前〜は当月の印刷を、月初は前月のお渡し確認を促す。
  // お渡し状況（handed/not_handed/none）が記録済みの会員は対象外。
  ipcMain.handle('evaluations:reminders', () => {
    const db = getDb()
    const now = new Date()
    const y = now.getFullYear(); const mo = now.getMonth(); const day = now.getDate()
    const lastDay = new Date(y, mo + 1, 0).getDate()
    const cur = `${y}-${pad2(mo + 1)}`
    const prevD = new Date(y, mo - 1, 1)
    const prev = `${prevD.getFullYear()}-${pad2(prevD.getMonth() + 1)}`
    const phase = day >= lastDay - 2 ? 'print' : 'handover'
    const targetYM = phase === 'print' ? cur : prev
    // パフォーマンス記録表は月額プラン会員のみが配布対象（回数券会員は対象外）
    const members = db.prepare("SELECT id, name, furigana FROM members WHERE status = 'active' AND COALESCE(plan_type,'ticket') = 'monthly' ORDER BY furigana, name").all()
    const hand = db.prepare('SELECT 1 AS x FROM evaluation_handovers WHERE member_id = ? AND year_month = ?')
    const pending = members.filter((m) => !hand.get(m.id, targetYM))
    return { targetYM, phase, members: pending }
  })

  // パフォーマンス記録表をPDFとして発行（保存）。
  // 現在のレンダラ画面を印刷CSS（@media print）で描画し、A4縦のPDFへ出力する。
  ipcMain.handle('evaluations:exportPdf', async (e, { memberName, ym } = {}) => {
    const win = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getFocusedWindow()
    if (!win) return { ok: false, error: 'no_window' }
    const safe = String(memberName || '会員').replace(/[\\/:*?"<>|]/g, '_')
    const defName = `パフォーマンス記録表_${safe}_${ym || ''}.pdf`.replace(/_\.pdf$/, '.pdf')
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'パフォーマンス記録表をPDFで保存',
      defaultPath: defName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      const data = await win.webContents.printToPDF({
        pageSize: 'A4',
        landscape: false,
        printBackground: true
      })
      fs.writeFileSync(filePath, data)
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}

/* ===================== クラウド同期（店舗PC ⇔ Mac 共有） ===================== */
function registerSyncIpc() {
  // 現在の同期状態（設定画面の表示用）
  ipcMain.handle('sync:status', () => getSyncStatus())

  // 同期先（Turso）のURL・トークンを保存。空文字なら同期解除。保存後は再起動で反映。
  ipcMain.handle('sync:setConfig', async (_e, { syncUrl, authToken }) => {
    let res
    try {
      res = writeSyncConfig({ syncUrl, authToken })
    } catch (e) {
      return { ok: false, error: e.message }
    }
    const win = BrowserWindow.getFocusedWindow()
    const confirm = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['後で', '再起動して反映'], defaultId: 1, cancelId: 0,
      message: res.cleared ? 'クラウド同期を解除しました' : 'クラウド同期の設定を保存しました',
      detail: '設定を反映するにはアプリの再起動が必要です。今すぐ再起動しますか？'
    })
    if (confirm.response === 1) { app.relaunch(); app.exit(0) }
    return { ...res, restarted: confirm.response === 1 }
  })

  // 今すぐ同期（手動プル/プッシュ）
  ipcMain.handle('sync:now', () => syncNow())
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
      SELECT se.exercise_name, MAX(se.weight_kg) AS weight_kg, s.session_date
      FROM session_exercises se JOIN sessions s ON s.id = se.session_id
      WHERE s.member_id = ? AND se.weight_kg IS NOT NULL AND s.session_date IS NOT NULL
      GROUP BY se.exercise_name, s.session_date
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
      // 1行=1セットの生データを種目単位へ再構成（セット配列・秒数・HIIT子種目を含む）
      const exercises = groupExercises(eStmt.all(s.id))
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
    (session_id, exercise_name, weight_kg, sets, reps, seconds, child_name, set_no, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const num = (v) => (v != null && v !== '' ? Number(v) : null)
  const txt = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null)
  let order = 0
  exercises.forEach((ex) => {
    if (!ex || !ex.exercise_name) return
    if (Array.isArray(ex.sets)) {
      // 新形式: sets はセット（または HIIT 子種目）ごとの配列。1行=1セット/1子種目で保存。
      // 各要素: { weight_kg, reps, seconds, child_name }
      const list = ex.sets.filter((st) => st && (
        (st.weight_kg != null && st.weight_kg !== '') ||
        (st.reps != null && st.reps !== '') ||
        (st.seconds != null && st.seconds !== '') ||
        (st.child_name != null && String(st.child_name).trim() !== '')))
      const total = list.length
      if (total === 0) {
        // 種目だけ選んで数値未入力でも、種目行は1つ残す
        ins.run(sid, ex.exercise_name, null, null, null, null, null, 1, order++)
        return
      }
      list.forEach((st, i) => {
        ins.run(sid, ex.exercise_name, num(st.weight_kg), total, num(st.reps), num(st.seconds), txt(st.child_name), i + 1, order++)
      })
    } else {
      // 旧形式: スカラー weight_kg/sets/reps（後方互換）
      ins.run(sid, ex.exercise_name, num(ex.weight_kg), num(ex.sets), num(ex.reps), num(ex.seconds), null, 1, order++)
    }
  })
}

// session_exercises の生行（1行=1セット）を種目単位へ再構成。
// set_no===1 または NULL（旧データ）で新しい種目グループを開始。
function groupExercises(rows) {
  const out = []
  const setOf = (r) => ({ weight_kg: r.weight_kg, reps: r.reps, seconds: r.seconds ?? null, child_name: r.child_name ?? null })
  for (const r of rows) {
    if (r.set_no == null) {
      // 旧データ: 1行=1種目。sets回数ぶんのセットへ展開
      const count = r.sets && r.sets > 1 ? r.sets : 1
      const sets = Array.from({ length: count }, () => setOf(r))
      out.push({ exercise_name: r.exercise_name, sets })
    } else if (r.set_no === 1 || out.length === 0) {
      out.push({ exercise_name: r.exercise_name, sets: [setOf(r)] })
    } else {
      out[out.length - 1].sets.push(setOf(r))
    }
  }
  return out
}

function getSessionFull(db, sid) {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid)
  if (!s) return null
  s.muscles = db.prepare('SELECT muscle_name FROM session_muscles WHERE session_id = ?').all(sid).map((r) => r.muscle_name)
  const rawEx = db.prepare('SELECT * FROM session_exercises WHERE session_id = ? ORDER BY order_index').all(sid)
  s.exercises = groupExercises(rawEx)
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
/* ===================== 手続き受付・会員統計・記念品 ===================== */
const PROC_TYPES = ['cancel', 'pause', 'transfer', 'option_cancel']
// 解約・オプション解約 → コース削除 / 休会・移行 → コース編集
const PROC_ACTION = { cancel: 'delete', option_cancel: 'delete', pause: 'edit', transfer: 'edit' }

// 受付日から「会費ペイ操作アラート」を表示する期間を求める。
// 受付が 1〜10日 → 当月14日〜翌月12日 / 受付が 11日以降 → 翌月14日〜翌々月12日
function procedureWindow(receivedAt) {
  const d = new Date(`${receivedAt}T00:00:00`)
  const Y = d.getFullYear(); const M = d.getMonth(); const day = d.getDate()
  if (day <= 10) {
    return { start: new Date(Y, M, 14), end: new Date(Y, M + 1, 12) }
  }
  return { start: new Date(Y, M + 1, 14), end: new Date(Y, M + 2, 12) }
}

// 入会日から今日までの満年数（誕生日方式：月日が来て初めて+1年）
function elapsedYears(joinedAt, today) {
  const j = new Date(`${joinedAt}T00:00:00`)
  if (isNaN(j)) return -1
  let y = today.getFullYear() - j.getFullYear()
  const md = today.getMonth() - j.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < j.getDate())) y--
  return y
}

function registerProcedureIpc() {
  // 手続き一覧（新しい受付順）。会員名・実施状況つき。
  ipcMain.handle('procedures:list', () => {
    const db = getDb()
    return db.prepare(`SELECT p.*, m.name, m.furigana, m.member_code
      FROM procedures p JOIN members m ON m.id = p.member_id
      ORDER BY p.received_at DESC, p.id DESC`).all()
  })

  // 受付登録。{ member_id, type, received_at?(既定=今日), note? }
  ipcMain.handle('procedures:create', (_e, d = {}) => {
    const db = getDb()
    if (!d.member_id || !PROC_TYPES.includes(d.type)) return { ok: false, error: 'invalid_args' }
    const received = (d.received_at && String(d.received_at).slice(0, 10)) || new Date().toISOString().slice(0, 10)
    const ym = received.slice(0, 7)
    const info = db.prepare(`INSERT INTO procedures (member_id, type, received_at, year_month, note)
      VALUES (?, ?, ?, ?, ?)`).run(d.member_id, d.type, received, ym, d.note || null)
    return { ok: true, id: info.lastInsertRowid }
  })

  // 実施済み（会費ペイのコース削除/編集を完了）→ アラートが消える
  ipcMain.handle('procedures:setDone', (_e, id) => {
    getDb().prepare("UPDATE procedures SET done = 1, done_at = datetime('now','localtime') WHERE id = ?").run(id)
    return { ok: true }
  })

  // 受付の取り消し（誤登録用）
  ipcMain.handle('procedures:remove', (_e, id) => {
    getDb().prepare('DELETE FROM procedures WHERE id = ?').run(id)
    return { ok: true }
  })

  // 表示期間内かつ未実施の手続きアラート。会員名・操作種別(削除/編集)つき。
  ipcMain.handle('procedures:alerts', () => {
    const db = getDb()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const rows = db.prepare(`SELECT p.id, p.member_id, p.type, p.received_at, m.name, m.furigana
      FROM procedures p JOIN members m ON m.id = p.member_id
      WHERE p.done = 0 ORDER BY p.received_at`).all()
    return rows.filter((p) => {
      const w = procedureWindow(p.received_at)
      return today >= w.start && today <= w.end
    }).map((p) => ({ ...p, action: PROC_ACTION[p.type] || 'edit' }))
  })

  // 会員統計：直近12か月の解約率・休会率・移行率。
  // 分母＝その月の月初に月額プランで在籍していたとみなせる会員数
  //  （月額プラン会員のうち、入会日が月初以前で、それ以前の月に解約手続きがない会員）。
  ipcMain.handle('procedures:stats', () => {
    const db = getDb()
    const now = new Date()
    const denomStmt = db.prepare(`SELECT COUNT(*) c FROM members m
      WHERE COALESCE(m.plan_type,'ticket') = 'monthly'
        AND m.joined_at IS NOT NULL AND m.joined_at <= ?
        AND NOT EXISTS (SELECT 1 FROM procedures p WHERE p.member_id = m.id AND p.type = 'cancel' AND p.year_month < ?)`)
    const numStmt = db.prepare("SELECT type, COUNT(*) c FROM procedures WHERE year_month = ? GROUP BY type")
    const months = []
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`
      const monthStart = `${ym}-01`
      const denom = denomStmt.get(monthStart, ym).c
      const counts = { cancel: 0, pause: 0, transfer: 0, option_cancel: 0 }
      numStmt.all(ym).forEach((r) => { if (counts[r.type] != null) counts[r.type] = r.c })
      const rate = (n) => (denom > 0 ? Math.round((n / denom) * 1000) / 10 : null)
      months.push({
        ym, denom,
        cancel: counts.cancel, pause: counts.pause, transfer: counts.transfer, optionCancel: counts.option_cancel,
        cancelRate: rate(counts.cancel), pauseRate: rate(counts.pause), transferRate: rate(counts.transfer)
      })
    }
    return { months }
  })

  // 在籍記念品アラート（1/2/3年）。会員ごとに「到達済みで未贈呈の最大周年」を1件返す。
  ipcMain.handle('anniversary:alerts', () => {
    const db = getDb()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const members = db.prepare(`SELECT id, name, furigana, joined_at FROM members
      WHERE status != 'withdrawn' AND joined_at IS NOT NULL AND joined_at != '' ORDER BY furigana, name`).all()
    const doneStmt = db.prepare('SELECT 1 x FROM anniversary_gifts WHERE member_id = ? AND years = ?')
    const out = []
    for (const m of members) {
      const yrs = elapsedYears(m.joined_at, today)
      const target = Math.min(yrs, 3) // 到達済みの最大周年（最大3年）
      if (target < 1) continue
      if (doneStmt.get(m.id, target)) continue
      out.push({ member_id: m.id, name: m.name, furigana: m.furigana, years: target })
    }
    return out
  })

  // 「贈呈済み」→ 指定周年以下をまとめて贈呈済みにする（下位周年が再表示されないように）
  ipcMain.handle('anniversary:setDone', (_e, { member_id, years }) => {
    const db = getDb()
    if (!member_id || !years) return { ok: false, error: 'invalid_args' }
    const ins = db.prepare(`INSERT INTO anniversary_gifts (member_id, years) VALUES (?, ?)
      ON CONFLICT(member_id, years) DO NOTHING`)
    const tx = db.transaction(() => { for (let y = 1; y <= years; y++) ins.run(member_id, y) })
    tx()
    return { ok: true }
  })
}

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
