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
