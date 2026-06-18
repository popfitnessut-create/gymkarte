// 評価シートのヘルパー群。
// 種目は固定マスタを廃止し、登録済みの種目プリセット（exercise_presets）から選ぶ方式に変更。
// 数値はセッション記録（session_exercises）の月別集計から自動反映する。

export function metricUnit(metric) {
  return metric === 'weight' ? 'kg' : metric === 'reps' ? '回' : metric === 'seconds' ? '秒' : ''
}

// 1レコードを「60kg × 10回」のような1行テキストに整形（重量・回数ベース）
export function recordSummary(rec) {
  if (!rec) return '—'
  const out = []
  if (rec.weight != null && rec.weight !== '') out.push(`${rec.weight}kg`)
  if (rec.reps != null && rec.reps !== '') out.push(`${rec.reps}回`)
  return out.length ? out.join(' × ') : '—'
}

// 伸び幅の表現。weight 優先、無ければ reps。{ metric, delta, unit } を返す
export function growthDelta(first, last) {
  if (!first || !last) return null
  if (first.weight != null && last.weight != null && (first.weight !== '' && last.weight !== '')) {
    return { metric: 'weight', delta: Number(last.weight) - Number(first.weight), unit: 'kg' }
  }
  if (first.reps != null && last.reps != null && (first.reps !== '' && last.reps !== '')) {
    return { metric: 'reps', delta: Number(last.reps) - Number(first.reps), unit: '回' }
  }
  return null
}

// 今月の YYYY-MM
export function currentYearMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 前月の YYYY-MM
export function prevYearMonth(ym) {
  const m = String(ym || currentYearMonth()).match(/^(\d{4})-(\d{2})/)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 2, 1)
  return currentYearMonth(d)
}

// YYYY-MM → 「2026年6月」表示
export function fmtYearMonth(ym) {
  if (!ym) return ''
  const m = String(ym).match(/^(\d{4})-(\d{2})/)
  if (!m) return ym
  return `${m[1]}年${Number(m[2])}月`
}

// 直近24ヶ月の選択肢（新しい順）。当月を先頭に。
export function monthOptions(count = 24, base = new Date()) {
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    out.push(currentYearMonth(d))
  }
  return out
}

// お渡し状況のラベル
export const HANDOVER_LABELS = {
  handed: 'お渡し済み',
  not_handed: '未お渡し',
  none: '発行なし'
}
