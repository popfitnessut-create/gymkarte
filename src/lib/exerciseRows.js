// セッション記録のメニュー行（種目・セット・HIIT子種目）の共通ヘルパー。
// シングル展開（SessionsTab）とマルチ展開（MultiKarte）で同一ロジックを使う。
//
// 行（フォーム状態）の形:
//  通常種目: { exercise_name, isHiit:false, metric:'reps'|'seconds', sets:[{weight_kg,reps,seconds}], children:[] }
//  HIIT種目: { exercise_name:'HIIT', isHiit:true, metric:'seconds', sets:[], children:[{child_name,weight_kg,seconds}] }

// 重量プリセット: 0kg〜80kg を 0.5kg刻み
export const WEIGHT_OPTIONS = Array.from({ length: 161 }, (_, i) => i * 0.5)
export const REP_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1)
// 秒数プリセット: 5秒刻みで60秒まで
export const SECONDS_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 5)

// HIIT種目かどうか（大文字小文字を無視）
export function isHiitName(name) { return String(name || '').toUpperCase() === 'HIIT' }

// 行（フォーム状態）のひな型
export function makeNormalRow(name = '') {
  return { exercise_name: name, isHiit: false, metric: 'reps', sets: [{ weight_kg: '', reps: '', seconds: '' }], children: [] }
}
export function makeHiitRow() {
  return { exercise_name: 'HIIT', isHiit: true, metric: 'seconds', sets: [], children: [{ child_name: '', weight_kg: '', seconds: '' }] }
}

// 保存済みの種目（グループ済みセット配列）をフォーム行へ復元
export function rowFromExercise(e) {
  const sets = Array.isArray(e.sets) && e.sets.length
    ? e.sets
    : [{ weight_kg: e.weight_kg, reps: e.reps, seconds: e.seconds }]
  const isHiit = isHiitName(e.exercise_name) || sets.some((s) => s && s.child_name)
  if (isHiit) {
    return {
      exercise_name: 'HIIT', isHiit: true, metric: 'seconds', sets: [],
      children: sets.map((s) => ({ child_name: s.child_name ?? '', weight_kg: s.weight_kg ?? '', seconds: s.seconds ?? '' }))
    }
  }
  // 秒数モード判定：秒数が入っていて回数が無ければ秒数モード
  const usesSeconds = sets.some((s) => s && s.seconds != null && s.seconds !== '') &&
    sets.every((s) => !s || s.reps == null || s.reps === '')
  return {
    exercise_name: e.exercise_name || '', isHiit: false, metric: usesSeconds ? 'seconds' : 'reps',
    sets: sets.map((st) => ({ weight_kg: st.weight_kg ?? '', reps: st.reps ?? '', seconds: st.seconds ?? '' })),
    children: []
  }
}

// 旧データなどでプリセット外の重量を持つ場合、その値も選択肢に含める
export function weightOptionsFor(cur) {
  const n = cur === '' || cur == null ? null : Number(cur)
  if (n == null || Number.isNaN(n) || WEIGHT_OPTIONS.includes(n)) return WEIGHT_OPTIONS
  return [...WEIGHT_OPTIONS, n].sort((a, b) => a - b)
}

// 種目名が入っている行だけ有効
export function validRowsOf(rows) {
  return (rows || []).filter((r) => String(r.exercise_name || '').trim())
}

// フォーム行配列 → 保存用 exercises ペイロード（ipc.js insertExercises が解釈する形）
export function rowsToExercises(rows) {
  return validRowsOf(rows).map((r) => {
    if (r.isHiit) {
      return {
        exercise_name: 'HIIT',
        sets: (r.children || [])
          .filter((c) => String(c.child_name || '').trim())
          .map((c) => ({ child_name: String(c.child_name).trim(), weight_kg: c.weight_kg, seconds: c.seconds }))
      }
    }
    return {
      exercise_name: String(r.exercise_name).trim(),
      sets: r.sets.map((st) => (r.metric === 'seconds'
        ? { weight_kg: st.weight_kg, seconds: st.seconds }
        : { weight_kg: st.weight_kg, reps: st.reps }))
    }
  })
}

// ===== 手動入力フォーマット（パフォーマンス記録表に反映できる規則的な書式）=====
// 1行 = 1種目。トークンは半角スペース1つで区切る。
//   形式: 「種目名 [重量kg] 回数」 または 「種目名 [重量kg] 秒数s」
//   ・重量は末尾に半角 kg（例: 60kg / 12.5kg）。省略可。
//   ・秒数は末尾に半角 s（例: 30s）。回数は数字のみ（例: 10）。
//   ・重量・回数・秒数はすべて半角英数字。全角スペースや全角数字は不可。
// 例:
//   ベンチプレス 60kg 10   → 重量60kg・10回
//   ラットプルダウン 8     → 8回（重量なし）
//   プランク 60s           → 60秒
//   プランク 20kg 30s      → 重量20kg・30秒
export const MANUAL_INPUT_HELP = '形式：種目名 [重量kg] 回数／種目名 [重量kg] 秒数s（半角スペース区切り・半角英数字）。例「ベンチプレス 60kg 10」「プランク 30s」'

// 手動入力の1行を種目オブジェクト（rowsToExercises と同じ形）へ変換。
// 書式を満たさない場合は null を返す（= パフォーマンス記録表に反映しない）。
export function parseManualLine(line) {
  const raw = String(line || '').trim()
  if (!raw) return null
  if (/[　０-９]/.test(raw)) return null // 全角スペース・全角数字は不可
  const parts = raw.split(' ').filter((s) => s !== '')
  if (parts.length < 2) return null
  const isMetric = (t) => /^\d+(\.\d+)?kg$/i.test(t) || /^\d+s$/i.test(t) || /^\d+$/.test(t)
  // 末尾から連続する数値トークン（重量kg / 秒数s / 回数）を拾う
  const metric = []
  let i = parts.length - 1
  while (i >= 1 && isMetric(parts[i])) { metric.unshift(parts[i]); i-- }
  if (metric.length === 0) return null
  const name = parts.slice(0, i + 1).join(' ').trim()
  if (!name) return null
  let weight = '', reps = '', seconds = ''
  for (const t of metric) {
    if (/kg$/i.test(t)) weight = Number(t.replace(/kg$/i, ''))
    else if (/s$/i.test(t)) seconds = Number(t.replace(/s$/i, ''))
    else reps = Number(t)
  }
  if (reps === '' && seconds === '') return null
  const set = seconds !== '' ? { weight_kg: weight, seconds } : { weight_kg: weight, reps }
  return { exercise_name: name, sets: [set] }
}

// 手動入力テキスト（複数行）を解析。{ exercises, invalid } を返す。
// invalid に書式違反の行（行番号・原文）が入る。空行は無視。
export function parseManualMenu(text) {
  const lines = String(text || '').split(/\r?\n/)
  const exercises = []
  const invalid = []
  lines.forEach((ln, idx) => {
    if (!ln.trim()) return
    const ex = parseManualLine(ln)
    if (ex) exercises.push(ex)
    else invalid.push({ line: idx + 1, text: ln.trim() })
  })
  return { exercises, invalid }
}

// 種目を1行テキストへ整形。
// 通常: 「ベンチプレス 60kg×10回」「プランク 60秒」、HIIT: 「HIIT: バーピー 20kg 30秒, ももあげ 20秒」
export function rowToLine(r) {
  if (r.isHiit) {
    const segs = (r.children || []).map((c) => {
      if (!String(c.child_name || '').trim()) return ''
      const p = [String(c.child_name).trim()]
      if (c.weight_kg !== '' && c.weight_kg != null) p.push(`${c.weight_kg}kg`)
      if (c.seconds !== '' && c.seconds != null) p.push(`${c.seconds}秒`)
      return p.join(' ')
    }).filter(Boolean)
    return 'HIIT' + (segs.length ? `: ${segs.join(', ')}` : '')
  }
  const name = String(r.exercise_name).trim()
  const segs = (r.sets || []).map((st) => {
    const p = []
    if (st.weight_kg !== '' && st.weight_kg != null) p.push(`${st.weight_kg}kg`)
    if (r.metric === 'seconds') {
      if (st.seconds !== '' && st.seconds != null) p.push(`${st.seconds}秒`)
    } else if (st.reps !== '' && st.reps != null) {
      p.push(`${st.reps}回`)
    }
    return p.join('×')
  }).filter(Boolean)
  return name + (segs.length ? ` ${segs.join(', ')}` : '')
}
