import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from 'recharts'
import { FileDown, Save, Send, Trash2, TrendingUp, Minus, X, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  metricUnit, recordSummary, currentYearMonth, fmtYearMonth, monthOptions, HANDOVER_LABELS
} from '../lib/evaluation'
import { tooltipStyle } from '../pages/Dashboard'
import { memberCode } from '../lib/format'

const MAX_PRINT = 4 // 印刷グラフ・記録に含められる種目数の上限（印刷は2列×2段まで）
const num = (v) => (v !== '' && v != null && !isNaN(Number(v)) ? Number(v) : null)

// 半ちゃん（マスコット）— 画像ファイルに依存しないインラインSVG。印刷でも必ず描画される。
function HanChan({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="半ちゃん">
      <rect x="14" y="13" width="36" height="7" rx="3.5" fill="#2f81f7" />
      <rect x="29" y="9" width="6" height="6" rx="2" fill="#e3b341" />
      <circle cx="32" cy="36" r="20" fill="#ffe1b8" stroke="#f0b66b" strokeWidth="2" />
      <circle cx="21" cy="40" r="4" fill="#ffb3a7" opacity="0.7" />
      <circle cx="43" cy="40" r="4" fill="#ffb3a7" opacity="0.7" />
      <circle cx="25" cy="34" r="2.6" fill="#3a2a1a" />
      <circle cx="39" cy="34" r="2.6" fill="#3a2a1a" />
      <circle cx="26" cy="33.2" r="0.9" fill="#fff" />
      <circle cx="40" cy="33.2" r="0.9" fill="#fff" />
      <path d="M25 43 Q32 49 39 43" fill="none" stroke="#3a2a1a" strokeWidth="2.2" strokeLinecap="round" />
      <g transform="translate(46 46)">
        <rect x="0" y="3" width="11" height="3" rx="1.5" fill="#5b6472" />
        <rect x="-2" y="0.5" width="3.5" height="8" rx="1.5" fill="#374151" />
        <rect x="9.5" y="0.5" width="3.5" height="8" rx="1.5" fill="#374151" />
      </g>
    </svg>
  )
}

// 前月比バッジ
function Delta({ cur, prev, unit }) {
  if (cur == null || prev == null) {
    return <span className="text-[11px] text-gray-500">{prev == null ? '初回記録' : '—'}</span>
  }
  const diff = +(cur - prev).toFixed(1)
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
        <TrendingUp size={11} /> +{diff}{unit}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-400">
      <Minus size={11} /> {diff === 0 ? '±0' : diff}{unit}
    </span>
  )
}

// グラフの成長ドット（前月より伸びた点は緑、停滞・下降はグレー、初回は青）
function GrowthDot(props) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  const color = payload.up == null ? '#2f81f7' : payload.up ? '#16a34a' : '#94a3b8'
  return <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#ffffff" strokeWidth={1.5} />
}

export default function EvaluationTab({ memberId, member }) {
  const [sheets, setSheets] = useState([])
  const [trainers, setTrainers] = useState([])
  const [presets, setPresets] = useState([])
  const [performance, setPerformance] = useState([]) // [{name, ym, weight, reps}]
  const [handovers, setHandovers] = useState([])     // [{year_month, status, recorded_at}]
  const [gymName, setGymName] = useState('')
  const [ym, setYm] = useState(currentYearMonth())
  // 印刷グラフ・記録に載せる種目（プリセットから最大3）。これが表・グラフ・印刷の唯一の対象。
  const [selected, setSelected] = useState([])
  const [form, setForm] = useState({
    trainer_name: '', feedback_positive: '', feedback_next: '', mascot_note: '', records: {}
  })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [msg, setMsg] = useState(null)

  const flash = (text, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000) }

  const reloadSheets = () => window.api.evaluations.list(memberId).then(setSheets)
  const reloadHandovers = () => window.api.evaluations.handovers(memberId).then(setHandovers)

  useEffect(() => {
    reloadSheets()
    reloadHandovers()
    window.api.evaluations.performance(memberId).then(setPerformance)
    window.api.presets.list().then(setPresets)
    window.api.trainers.list().then(setTrainers)
    window.api.settings.get().then((s) => setGymName(s.gym_name || ''))
  }, [memberId])

  // セッション記録の月別集計を { 種目名: { 'YYYY-MM': {weight, reps} } } に整形
  const perfMap = useMemo(() => {
    const m = {}
    for (const p of performance) {
      if (!p.name) continue
      if (!m[p.name]) m[p.name] = {}
      m[p.name][p.ym] = { weight: p.weight, reps: p.reps }
    }
    return m
  }, [performance])

  const presetNames = useMemo(
    () => [...new Set(presets.map((p) => p.name).filter(Boolean))], [presets])

  // 自動反映用：種目の (year_month) 時点のセッション集計値
  const autoVals = (name, m) => perfMap[name]?.[m] || {}
  const autoRecord = (name, m) => {
    const a = autoVals(name, m)
    return { weight: a.weight ?? '', reps: a.reps ?? '', note: '' }
  }

  // 対象月のシートをフォームへ反映（無ければ未選択の空状態）
  useEffect(() => {
    const sheet = sheets.find((s) => s.year_month === ym)
    if (sheet) {
      const names = sheet.records.map((r) => r.exercise_key).slice(0, MAX_PRINT)
      const recs = {}
      for (const r of sheet.records) {
        recs[r.exercise_key] = { weight: r.weight ?? '', reps: r.reps ?? '', note: r.note ?? '' }
      }
      setForm({
        trainer_name: sheet.trainer_name || '',
        feedback_positive: sheet.feedback_positive || '',
        feedback_next: sheet.feedback_next || '',
        mascot_note: sheet.mascot_note || '',
        records: recs
      })
      setSelected(names)
    } else {
      // 新規月は何も選択しない（種目はプリセットから手動で追加）
      setForm({ trainer_name: '', feedback_positive: '', feedback_next: '', mascot_note: '', records: {} })
      setSelected([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, sheets, performance, presets])

  const currentSheet = useMemo(() => sheets.find((s) => s.year_month === ym) || null, [sheets, ym])
  const handMap = useMemo(() => Object.fromEntries(handovers.map((h) => [h.year_month, h.status])), [handovers])
  const curHandover = handMap[ym] || null

  const setRec = (name, field, value) =>
    setForm((f) => ({ ...f, records: { ...f.records, [name]: { ...f.records[name], [field]: value } } }))

  // プリセットから種目を追加（最大3）。記録欄の自動反映値も同時に用意。
  const addExercise = (name) => {
    if (!name) return
    if (selected.includes(name)) { flash('すでに選択済みです。', false); return }
    if (selected.length >= MAX_PRINT) { flash(`種目は最大${MAX_PRINT}つまでです。`, false); return }
    setSelected((s) => [...s, name])
    setForm((f) => (f.records[name] ? f : { ...f, records: { ...f.records, [name]: autoRecord(name, ym) } }))
  }
  const removeExercise = (name) => {
    setSelected((s) => s.filter((n) => n !== name))
    setForm((f) => {
      const records = { ...f.records }; delete records[name]
      return { ...f, records }
    })
  }

  // 種目の「今月の記録」「前月の記録」を重量・回数セットで返す。
  // 今月＝フォーム手入力優先（無ければ当月のセッション集計）／前月＝当月より前で最も新しい月のセッション集計。
  const exStat = (name) => {
    const per = perfMap[name] || {}
    const fW = num(form.records[name]?.weight)
    const fR = num(form.records[name]?.reps)
    const curRec = {
      weight: fW != null ? fW : (per[ym]?.weight ?? null),
      reps: fR != null ? fR : (per[ym]?.reps ?? null)
    }
    const before = Object.keys(per).filter((mm) => mm < ym).sort()
    const pm = before.length ? per[before[before.length - 1]] : null
    const prevRec = pm ? { weight: pm.weight ?? null, reps: pm.reps ?? null } : null
    // 主軸：重量の記録があれば重量、無ければ回数で前月比を取る
    const hasWeight = curRec.weight != null || (prevRec && prevRec.weight != null) ||
      Object.values(per).some((v) => v.weight != null)
    const metric = hasWeight ? 'weight' : 'reps'
    const cur = curRec[metric]
    const prev = prevRec ? prevRec[metric] : null
    return { metric, cur, prev, curRec, prevRec, unit: metricUnit(metric) }
  }

  // 種目1つ分の時系列グラフ（セッション集計の履歴＋入力中の当月値をライブ反映）
  const buildChart = (name) => {
    const { metric } = exStat(name)
    const per = perfMap[name] || {}
    const m = {}
    for (const mm of Object.keys(per)) {
      const v = per[mm][metric]
      if (v != null) m[mm] = { value: v, reps: per[mm].reps }
    }
    const cv = num(form.records[name]?.[metric])
    if (cv != null) m[ym] = { value: cv, reps: num(form.records[name]?.reps) }
    const months = Object.keys(m).sort()
    let prev = null
    const data = months.map((mm) => {
      const value = m[mm].value
      const up = prev == null ? null : value > prev ? true : value < prev ? false : null
      prev = value
      return { ym: mm, label: `${Number(mm.slice(5))}月`, value, reps: m[mm].reps, up }
    })
    return { name, metric, unit: metricUnit(metric), data }
  }

  const positiveEmpty = !form.feedback_positive.trim()

  const buildPayload = (status) => ({
    member_id: memberId,
    year_month: ym,
    status,
    trainer_name: form.trainer_name || null,
    feedback_positive: form.feedback_positive,
    feedback_next: form.feedback_next,
    mascot_note: form.mascot_note,
    records: selected.map((name) => ({
      exercise_key: name,
      weight: num(form.records[name]?.weight),
      reps: num(form.records[name]?.reps),
      seconds: null,
      note: form.records[name]?.note || null
    }))
  })

  const doSave = async (status) => {
    if (status === 'issued' && positiveEmpty) {
      flash('「がんばり・良かった点」は必須です。空欄では発行できません。', false)
      return
    }
    setSaving(true)
    const res = await window.api.evaluations.save(buildPayload(status))
    setSaving(false)
    if (!res?.ok) {
      flash(res?.error === 'feedback_positive_required'
        ? '「がんばり・良かった点」は必須です。' : '保存に失敗しました。', false)
      return
    }
    await reloadSheets()
    flash(status === 'draft' ? '下書きを保存しました。' : 'パフォーマンス記録表を発行しました。')
  }

  const removeSheet = async () => {
    if (!currentSheet) return
    if (!confirm(`${fmtYearMonth(ym)}のパフォーマンス記録表を削除しますか？この操作は取り消せません。`)) return
    await window.api.evaluations.remove(currentSheet.id)
    await reloadSheets()
    setYm(currentYearMonth())
    flash('削除しました。')
  }

  // PDFとして発行（保存）。印刷CSSのレイアウトでA4縦のPDFを書き出す。
  const exportPdf = async () => {
    if (selected.length === 0) { flash('種目が未設定です。1つ以上追加してください。', false); return }
    setExporting(true)
    const res = await window.api.evaluations.exportPdf({ memberName: member?.name, ym })
    setExporting(false)
    if (res?.ok) flash('PDFを保存しました。')
    else if (!res?.canceled) flash('PDFの保存に失敗しました。', false)
  }

  // お渡し状況の記録（保存するとアラートが消える）
  const saveHandover = async (status) => {
    await window.api.evaluations.setHandover({ member_id: memberId, year_month: ym, status })
    await reloadHandovers()
    flash(`お渡し状況「${HANDOVER_LABELS[status]}」を記録しました。`)
  }
  const clearHandover = async () => {
    await window.api.evaluations.clearHandover({ member_id: memberId, year_month: ym })
    await reloadHandovers()
    flash('お渡し状況を未記録に戻しました。')
  }

  const months = monthOptions(24)
  const issuedSet = new Set(sheets.map((s) => s.year_month))
  const selectedCharts = selected.map(buildChart)
  // 追加候補（未選択のプリセット種目）
  const addOptions = presetNames.filter((n) => !selected.includes(n))

  return (
    <div className="max-w-5xl">
      {/* === 画面UI（印刷時は非表示） === */}
      <div className="no-print space-y-6">
        {/* ① 月選択・操作 */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-700 bg-navy-800 p-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">対象月</span>
            <select value={ym} onChange={(e) => setYm(e.target.value)} className={inp}>
              {months.map((mm) => (
                <option key={mm} value={mm}>{fmtYearMonth(mm)}{issuedSet.has(mm) ? '（発行済）' : ''}</option>
              ))}
            </select>
          </label>
          {currentSheet ? (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${currentSheet.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
              {currentSheet.status === 'draft' ? '下書き' : '発行済み'}
              {currentSheet.updated_at && currentSheet.created_at && currentSheet.updated_at !== currentSheet.created_at ? '・修正済み' : ''}
            </span>
          ) : (
            <span className="rounded-full bg-navy-700 px-2.5 py-1 text-xs text-gray-400">新規</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => doSave('draft')} disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-navy-600 px-3 py-2 text-sm text-gray-300 hover:border-accent hover:text-accent disabled:opacity-50">
              <Save size={15} /> 下書き保存
            </button>
            <button onClick={() => doSave('issued')} disabled={saving || positiveEmpty}
              title={positiveEmpty ? '「がんばり・良かった点」が未入力です' : ''}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              <Send size={15} /> {currentSheet && currentSheet.status !== 'draft' ? '再発行（上書き）' : '発行する'}
            </button>
            <button onClick={exportPdf} disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg bg-accent-gold px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90 disabled:opacity-50">
              <FileDown size={15} /> {exporting ? 'PDF作成中…' : 'PDF発行'}
            </button>
          </div>
        </div>

        {/* お渡し状況（未記録ならアラート、記録済みなら確認表示） */}
        <div className={`rounded-xl border p-4 ${curHandover ? 'border-green-500/40 bg-green-500/5' : 'border-amber-400/50 bg-amber-50'}`}>
          <div className="flex flex-wrap items-center gap-3">
            {curHandover ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
                <CheckCircle2 size={16} /> {fmtYearMonth(ym)}：{HANDOVER_LABELS[curHandover]}（記録済み）
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
                <AlertCircle size={16} /> {fmtYearMonth(ym)}のお渡し状況が未記録です。下から選択してください。
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {['handed', 'not_handed', 'none'].map((st) => (
                <button key={st} onClick={() => saveHandover(st)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition
                    ${curHandover === st
                      ? 'bg-accent text-white'
                      : 'border border-navy-600 text-gray-300 hover:border-accent hover:text-accent'}`}>
                  {HANDOVER_LABELS[st]}
                </button>
              ))}
              {curHandover && (
                <button onClick={clearHandover} className="text-xs text-gray-400 hover:text-red-500 hover:underline">
                  未記録に戻す
                </button>
              )}
            </div>
          </div>
        </div>

        {msg && (
          <div className={`rounded-lg border px-4 py-2.5 text-sm ${msg.ok ? 'border-green-500/40 bg-green-500/10 text-green-600' : 'border-red-500/40 bg-red-500/10 text-red-500'}`}>
            {msg.text}
          </div>
        )}

        {/* ② 印刷グラフに載せる種目（プリセットから最大3を選択） */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-gray-300">印刷グラフに載せる種目
              <span className="ml-1 text-xs text-gray-400">（プリセットから最大{MAX_PRINT}種目）</span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">選択中 <span className="font-medium text-accent">{selected.length}</span> / {MAX_PRINT}</span>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">種目を追加</span>
                <select value="" onChange={(e) => addExercise(e.target.value)} disabled={selected.length >= MAX_PRINT}
                  className={`${inp} disabled:opacity-50`}>
                  <option value="">プリセットから選択…</option>
                  {addOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          </div>
          {selected.length === 0 ? (
            <div className="rounded-lg border border-dashed border-navy-600 p-6 text-center text-sm text-gray-500">
              「種目を追加」からプリセット種目を選ぶと、グラフ・記録・印刷シートに反映されます。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selected.map((name, i) => {
                const { cur, prev, unit, curRec, prevRec } = exStat(name)
                const up = cur != null && prev != null && cur > prev
                return (
                  <div key={name}
                    className={`relative rounded-xl border p-3 ${up ? 'border-green-300 bg-green-50/40' : 'border-navy-700 bg-navy-900'}`}>
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <button onClick={() => removeExercise(name)} title="この種目を外す"
                      className="absolute right-9 top-2 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-red-500/10 hover:text-red-500">
                      <X size={13} />
                    </button>
                    <div className="mb-1 truncate pr-16 text-xs text-gray-400">{name}</div>
                    <div className="text-lg font-bold text-gray-100">{recordSummary(curRec)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Delta cur={cur} prev={prev} unit={unit} />
                      <span className="text-[10px] text-gray-500">前月：{prevRec ? recordSummary(prevRec) : '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ③ グラフ（選択した1〜3種目を横並び表示。印刷もこの内容で出力される） */}
        {selected.length > 0 && (
          <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">月推移グラフ（選択中の{selected.length}種目）</h3>
              <p className="text-[11px] text-gray-500">
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-600 align-middle" />伸びた月
                <span className="ml-2 mr-1 inline-block h-2 w-2 rounded-full bg-gray-400 align-middle" />停滞・下降
              </p>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(selected.length, 2)}, minmax(0, 1fr))` }}>
              {selectedCharts.map(({ name, unit, metric, data }) => (
                <div key={name} className="rounded-lg border border-navy-700 bg-navy-900/40 p-3">
                  <div className="mb-2 text-xs font-medium text-gray-300">{name}</div>
                  {data.length === 0 ? (
                    <div className="flex h-[220px] items-center justify-center text-center text-xs text-gray-500">
                      記録がまだありません。<br />セッション記録か下のフォームに入力すると表示されます。
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: '#5b6472', fontSize: 10 }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
                        <YAxis tick={{ fill: '#5b6472', fontSize: 10 }} axisLine={false} tickLine={false} unit={unit} domain={['auto', 'auto']} width={40} />
                        <Tooltip contentStyle={tooltipStyle}
                          formatter={(v, n, p) => [
                            p?.payload?.reps != null && metric === 'weight' ? `${v}${unit}（${p.payload.reps}回）` : `${v}${unit}`,
                            name
                          ]} />
                        <Line type="monotone" dataKey="value" stroke="#2f81f7" strokeWidth={2.5} dot={<GrowthDot />} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ④ 当月の記録（セッション記録から自動反映。必要に応じて手修正可） */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
          <h3 className="mb-3 text-sm font-medium text-gray-300">{fmtYearMonth(ym)}の記録</h3>
          {selected.length === 0 ? (
            <p className="text-sm text-gray-500">上の「種目を追加」からプリセット種目を選んでください。</p>
          ) : (
            <div className="space-y-2.5">
              {selected.map((name) => {
                const rec = form.records[name] || { weight: '', reps: '', note: '' }
                const a = autoVals(name, ym)
                return (
                  <div key={name} className="grid grid-cols-[150px_1fr_28px] items-center gap-3 rounded-lg border border-navy-700 bg-navy-900 px-3 py-2.5">
                    <div>
                      <div className="text-sm font-medium text-gray-200">{name}</div>
                      <div className="text-[10px] text-gray-500">重量(kg) × 回数</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Num label="重量" unit="kg" value={rec.weight} placeholder={a.weight} onChange={(v) => setRec(name, 'weight', v)} />
                      <Num label="回数" unit="回" value={rec.reps} placeholder={a.reps} onChange={(v) => setRec(name, 'reps', v)} />
                      <input value={rec.note} onChange={(e) => setRec(name, 'note', e.target.value)}
                        placeholder="備考（任意）" className={`${inp} min-w-[120px] flex-1`} />
                    </div>
                    <button onClick={() => removeExercise(name)} title="この種目を外す"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-500/10 hover:text-red-500">
                      <X size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-2 text-[11px] text-gray-500">※ セッション記録から自動反映しています。薄字はその月の集計値。手入力で上書きもできます。</p>
        </div>

        {/* ⑤ フィードバック入力 */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
          <h3 className="mb-4 text-sm font-medium text-gray-300">トレーナーからのフィードバック</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">担当トレーナー</span>
              <select value={form.trainer_name} onChange={(e) => setForm((f) => ({ ...f, trainer_name: e.target.value }))} className={`${inp} w-full`}>
                <option value="">未選択</option>
                {trainers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </label>
            <div />
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium text-green-600">がんばり・良かった点（必須）<span className="ml-1 text-gray-400">※数字が伸びない月でも必ず前向きに</span></span>
              <textarea value={form.feedback_positive} onChange={(e) => setForm((f) => ({ ...f, feedback_positive: e.target.value }))}
                rows={3} placeholder="例）毎週きちんと通えています！フォームがとても安定してきました。"
                className={`${inp} w-full ${positiveEmpty ? 'border-amber-400' : ''}`} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs text-gray-400">来月の目標・アドバイス（任意）</span>
              <textarea value={form.feedback_next} onChange={(e) => setForm((f) => ({ ...f, feedback_next: e.target.value }))}
                rows={2} placeholder="例）来月はスクワットを＋2.5kgに挑戦してみましょう！"
                className={`${inp} w-full`} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs text-gray-400">半ちゃんからのひとこと（任意・印刷シートに表示）</span>
              <input value={form.mascot_note} onChange={(e) => setForm((f) => ({ ...f, mascot_note: e.target.value }))}
                placeholder="例）今月もよくがんばったね！来月も一緒にトレーニングしよう💪"
                className={`${inp} w-full`} />
            </label>
          </div>
        </div>

        {/* ⑥ 過去シート一覧 */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
          <h3 className="mb-3 text-sm font-medium text-gray-300">過去のパフォーマンス記録表（{sheets.length}件）</h3>
          {sheets.length === 0 ? (
            <p className="text-sm text-gray-500">まだ発行された記録表はありません。</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-navy-700">
              <table className="w-full text-sm">
                <thead className="bg-navy-900 text-xs text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left">対象月</th>
                    <th className="px-4 py-2 text-left">状態</th>
                    <th className="px-4 py-2 text-left">お渡し</th>
                    <th className="px-4 py-2 text-left">担当</th>
                    <th className="px-4 py-2 text-left">発行日</th>
                    <th className="px-4 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s) => (
                    <tr key={s.id} className={`border-t border-navy-700 ${s.year_month === ym ? 'bg-accent/5' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-200">{fmtYearMonth(s.year_month)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${s.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {s.status === 'draft' ? '下書き' : '発行済み'}
                        </span>
                        {s.updated_at && s.created_at && s.updated_at !== s.created_at && (
                          <span className="ml-1 text-[10px] text-gray-400">修正済み</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{handMap[s.year_month] ? HANDOVER_LABELS[handMap[s.year_month]] : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-300">{s.trainer_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400">{s.issued_at ? String(s.issued_at).slice(0, 10) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setYm(s.year_month)} className="rounded-md border border-navy-600 px-2.5 py-1 text-xs text-gray-300 hover:border-accent hover:text-accent">
                          開く
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {currentSheet && (
            <div className="mt-3 text-right">
              <button onClick={removeSheet} className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline">
                <Trash2 size={13} /> {fmtYearMonth(ym)}の記録表を削除
              </button>
            </div>
          )}
        </div>
      </div>

      {/* === 印刷専用シート（画面では非表示・印刷時のみ表示） === */}
      <PrintSheet
        member={member} ym={ym} form={form} exercises={selected} exStat={exStat}
        gymName={gymName} charts={selectedCharts} issuedAt={currentSheet?.issued_at} />
    </div>
  )
}

// 印刷シート（A4縦・1ページ）
function PrintSheet({ member, ym, form, exercises, exStat, gymName, charts, issuedAt }) {
  // 2列レイアウト（1種目は1列フル、2種目以上は2列×最大2段）。重量軸が見切れないよう各グラフ幅を確保。
  const n = Math.max(1, charts.length)
  const cols = n === 1 ? 1 : 2
  const chartW = n === 1 ? 690 : 332
  const chartH = n > 2 ? 150 : 196
  return (
    <div id="eval-print" className="eval-print">
      <div className="ep-header">
        <div className="ep-brand">
          <HanChan size={64} />
          <div>
            <div className="ep-gym">{gymName || 'GymKarte'}</div>
            <div className="ep-title">{member?.name} 様　パフォーマンス記録表（{fmtYearMonth(ym)}）</div>
            <div className="ep-sub">{memberCode(member)}</div>
          </div>
        </div>
        <div className="ep-badge">毎月の成長記録 💪</div>
      </div>

      <table className="ep-table">
        <thead>
          <tr>
            <th style={{ width: '26%' }}>種目</th>
            <th>今月の記録</th>
            <th style={{ width: '20%' }}>前月の記録</th>
            <th style={{ width: '16%' }}>前月比</th>
          </tr>
        </thead>
        <tbody>
          {exercises.length === 0 ? (
            <tr><td colSpan={4} className="ep-prev">種目が未設定です。</td></tr>
          ) : exercises.map((name) => {
            const { cur, prev, unit, curRec, prevRec } = exStat(name)
            const note = form.records[name]?.note
            const diff = cur != null && prev != null ? +(cur - prev).toFixed(1) : null
            return (
              <tr key={name}>
                <td className="ep-ex">{name}</td>
                <td>{recordSummary(curRec)}{note ? <span className="ep-note">（{note}）</span> : null}</td>
                <td className="ep-prev">{prevRec ? recordSummary(prevRec) : '—'}</td>
                <td>
                  {diff == null ? <span className="ep-flat">{prevRec == null ? '初回' : '—'}</span>
                    : diff > 0 ? <span className="ep-up">▲ +{diff}{unit}</span>
                    : <span className="ep-flat">{diff === 0 ? '±0' : `▼ ${diff}${unit}`}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {charts.length > 0 && (
        <div className="ep-charts" style={{ gridTemplateColumns: `repeat(${cols}, max-content)` }}>
          {charts.map(({ name, unit, data }) => (
            <div key={name} className="ep-chart-wrap">
              <div className="ep-chart-title">{name} の推移</div>
              {data.length > 0 ? (
                <LineChart width={chartW} height={chartH} data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#374151', fontSize: 10 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                  <YAxis tick={{ fill: '#374151', fontSize: 10 }} axisLine={false} tickLine={false} unit={unit} width={44} />
                  <Line type="monotone" dataKey="value" stroke="#2f81f7" strokeWidth={2.5} dot={<GrowthDot />} isAnimationActive={false} />
                </LineChart>
              ) : <div className="ep-chart-empty" style={{ width: chartW, height: chartH }}>記録が増えると推移が表示されます。</div>}
            </div>
          ))}
        </div>
      )}

      <div className="ep-fb">
        <div className="ep-fb-box ep-fb-positive">
          <div className="ep-fb-label">がんばり・良かった点</div>
          <div className="ep-fb-text">{form.feedback_positive || '—'}</div>
        </div>
        {form.feedback_next && (
          <div className="ep-fb-box">
            <div className="ep-fb-label">来月の目標・アドバイス</div>
            <div className="ep-fb-text">{form.feedback_next}</div>
          </div>
        )}
        {form.mascot_note && (
          <div className="ep-mascot">
            <HanChan size={40} />
            <div className="ep-bubble">{form.mascot_note}</div>
          </div>
        )}
      </div>

      <div className="ep-footer">
        <span>発行日：{issuedAt ? String(issuedAt).slice(0, 10) : new Date().toISOString().slice(0, 10)}</span>
        <span>担当トレーナー：{form.trainer_name || '—'}</span>
      </div>
    </div>
  )
}

// 数値入力（その月のセッション集計値をプレースホルダーに薄字表示）
function Num({ label, unit, value, placeholder, onChange }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] text-gray-500">{label}</span>
      <input type="number" step="any" value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder != null ? String(placeholder) : ''}
        className="w-16 rounded-lg border border-navy-600 bg-navy-900 px-2 py-1.5 text-sm outline-none focus:border-accent" />
      <span className="text-[10px] text-gray-500">{unit}</span>
    </span>
  )
}

const inp ='rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm outline-none focus:border-accent'
