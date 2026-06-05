import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Save, Trash2 } from 'lucide-react'
import { inp, L } from './TicketsTab'

const MOODS = ['😞', '🙁', '😐', '🙂', '😊']
const todayStr = () => new Date().toISOString().slice(0, 10)

// 日次カルテタブ：左にカレンダー（記録済みにドット）、右に記録フォーム
export default function DailyLogTab({ memberId }) {
  const [logs, setLogs] = useState([])
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selected, setSelected] = useState(todayStr())

  const load = () => window.api.daily.list(memberId).then(setLogs)
  useEffect(() => { load() }, [memberId])

  const logDates = new Set(logs.map((l) => l.log_date))
  const current = logs.find((l) => l.log_date === selected) || null

  return (
    <div className="flex max-w-5xl gap-6">
      <div className="w-72 shrink-0">
        <Calendar cursor={cursor} setCursor={setCursor} selected={selected} setSelected={setSelected} logDates={logDates} />
        <p className="mt-3 text-xs text-gray-500">● のついた日は記録済みです</p>
      </div>
      <div className="flex-1">
        <DailyForm key={selected} memberId={memberId} date={selected} existing={current} onSaved={load} />
      </div>
    </div>
  )
}

function Calendar({ cursor, setCursor, selected, setSelected, logDates }) {
  const { y, m } = cursor
  const first = new Date(y, m, 1)
  const startDow = first.getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  const pad = (n) => String(n).padStart(2, '0')
  const dateStr = (d) => `${y}-${pad(m + 1)}-${pad(d)}`
  const prev = () => setCursor(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })
  const next = () => setCursor(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={prev} className="rounded p-1 text-gray-400 hover:bg-navy-700"><ChevronLeft size={16} /></button>
        <span className="text-sm font-medium">{y}年{m + 1}月</span>
        <button onClick={next} className="rounded p-1 text-gray-400 hover:bg-navy-700"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
        {['日', '月', '火', '水', '木', '金', '土'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const ds = dateStr(d)
          const isSel = ds === selected
          const has = logDates.has(ds)
          return (
            <button key={i} onClick={() => setSelected(ds)}
              className={`relative flex h-8 items-center justify-center rounded text-xs
                ${isSel ? 'bg-accent text-white' : 'hover:bg-navy-700'}`}>
              {d}
              {has && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${isSel ? 'bg-white' : 'bg-accent'}`} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DailyForm({ memberId, date, existing, onSaved }) {
  const blank = {
    weight_kg: '', body_fat_pct: '', condition_score: '', sleep_hours: '',
    sleep_quality_score: '', meal_notes: '', water_ml: '', member_comment: '', trainer_note: ''
  }
  const [form, setForm] = useState(() => existing ? { ...blank, ...numize(existing) } : blank)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    await window.api.daily.save({ member_id: memberId, log_date: date, ...form })
    setSaving(false)
    setSavedAt(new Date())
    onSaved()
  }
  const remove = async () => {
    if (!existing || !confirm('この日の記録を削除しますか？')) return
    await window.api.daily.remove(existing.id)
    onSaved()
    setForm(blank)
  }

  return (
    <div>
      <h3 className="mb-4 text-sm font-medium text-gray-300">{date} の記録</h3>
      <div className="grid grid-cols-2 gap-4">
        <L label="体重 (kg)"><input type="number" step="0.1" value={form.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} className={inp} /></L>
        <L label="体脂肪率 (%)"><input type="number" step="0.1" value={form.body_fat_pct} onChange={(e) => set('body_fat_pct', e.target.value)} className={inp} /></L>
        <L label="体調"><MoodPicker value={form.condition_score} onChange={(v) => set('condition_score', v)} /></L>
        <L label="睡眠の質"><MoodPicker value={form.sleep_quality_score} onChange={(v) => set('sleep_quality_score', v)} /></L>
        <L label="睡眠時間 (h)"><input type="number" step="0.5" value={form.sleep_hours} onChange={(e) => set('sleep_hours', e.target.value)} className={inp} /></L>
        <L label="水分摂取量 (ml)"><input type="number" value={form.water_ml} onChange={(e) => set('water_ml', e.target.value)} className={inp} /></L>
        <L label="食事メモ（朝・昼・夜・間食）" full><textarea rows={3} value={form.meal_notes} onChange={(e) => set('meal_notes', e.target.value)} className={inp} /></L>
        <L label="本人コメント（気になること・自己申告）" full><textarea rows={2} value={form.member_comment} onChange={(e) => set('member_comment', e.target.value)} className={inp} /></L>
        <L label="トレーナー所見" full><textarea rows={2} value={form.trainer_note} onChange={(e) => set('trainer_note', e.target.value)} className={inp} /></L>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          <Save size={16} /> {saving ? '保存中…' : '保存'}
        </button>
        {existing && (
          <button onClick={remove} className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10">
            <Trash2 size={16} /> 削除
          </button>
        )}
        {savedAt && <span className="text-xs text-green-400">保存しました</span>}
      </div>
    </div>
  )
}

function MoodPicker({ value, onChange }) {
  return (
    <div className="flex h-[38px] items-center gap-1 rounded-lg border border-navy-600 bg-navy-900 px-2">
      {MOODS.map((emo, i) => {
        const score = i + 1
        return (
          <button key={score} onClick={() => onChange(value === score ? '' : score)}
            className={`flex-1 rounded text-lg transition ${value === score ? 'bg-accent/25 scale-110' : 'opacity-50 hover:opacity-100'}`}
            title={`${score}`}>{emo}</button>
        )
      })}
    </div>
  )
}

// DBのnull値を空文字に変換（input制御用）
function numize(log) {
  const out = {}
  for (const k of ['weight_kg', 'body_fat_pct', 'condition_score', 'sleep_hours', 'sleep_quality_score', 'meal_notes', 'water_ml', 'member_comment', 'trainer_note']) {
    out[k] = log[k] == null ? '' : log[k]
  }
  return out
}
