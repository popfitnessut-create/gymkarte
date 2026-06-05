import { useEffect, useState } from 'react'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { calcAge } from '../lib/format'

// Phase 1では基本情報タブのみ実装。他タブはプレースホルダ表示。
const TABS = [
  { key: 'basic', label: '基本情報' },
  { key: 'tickets', label: '回数券', phase: 'Phase 2' },
  { key: 'sessions', label: 'セッション記録', phase: 'Phase 2' },
  { key: 'daily', label: '日次カルテ', phase: 'Phase 2' },
  { key: 'analytics', label: '分析', phase: 'Phase 4' }
]

export default function MemberDetail() {
  const id = useStore((s) => s.selectedMemberId)
  const back = useStore((s) => s.backToList)
  const [tab, setTab] = useState('basic')
  const [member, setMember] = useState(null)

  useEffect(() => {
    if (id) window.api.members.get(id).then(setMember)
  }, [id])

  if (!member) return <div className="p-8 text-gray-400">読み込み中…</div>

  return (
    <div className="p-8">
      <button onClick={back} className="mb-4 flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        <ArrowLeft size={16} /> 会員一覧に戻る
      </button>

      <div className="mb-1 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">{member.name}</h1>
        <span className="text-sm text-gray-400">{member.furigana}</span>
        <span className="text-xs text-gray-500">#{String(member.id).padStart(4, '0')}</span>
      </div>

      {/* タブ */}
      <div className="mb-6 mt-4 flex gap-1 border-b border-navy-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition
              ${tab === t.key ? 'text-accent' : 'text-gray-400 hover:text-white'}`}
          >
            {t.label}
            {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
          </button>
        ))}
      </div>

      {tab === 'basic'
        ? <BasicInfoTab member={member} onSaved={setMember} />
        : <Placeholder phase={TABS.find((t) => t.key === tab)?.phase} />}
    </div>
  )
}

function Placeholder({ phase }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-600 p-12 text-center text-gray-500">
      このタブは {phase} で実装予定です。
    </div>
  )
}

function BasicInfoTab({ member, onSaved }) {
  const [form, setForm] = useState(member)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const back = useStore((s) => s.backToList)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => setForm(member), [member])

  const save = async () => {
    setSaving(true)
    const updated = await window.api.members.update(form)
    setSaving(false)
    setSavedAt(new Date())
    onSaved(updated)
  }

  const remove = async () => {
    if (!confirm(`${member.name} さんを削除しますか？この操作は取り消せません。`)) return
    await window.api.members.remove(member.id)
    back()
  }

  const age = calcAge(form.birthdate)

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-2 gap-5">
        <Field label="氏名（漢字）">
          <input value={form.name || ''} onChange={(e) => set('name', e.target.value)} className={inp} />
        </Field>
        <Field label="フリガナ">
          <input value={form.furigana || ''} onChange={(e) => set('furigana', e.target.value)} className={inp} />
        </Field>
        <Field label={`生年月日${age != null ? `（${age}歳）` : ''}`}>
          <input type="date" value={form.birthdate || ''} onChange={(e) => set('birthdate', e.target.value)} className={inp} />
        </Field>
        <Field label="性別">
          <select value={form.gender || ''} onChange={(e) => set('gender', e.target.value)} className={inp}>
            <option value="male">男性</option>
            <option value="female">女性</option>
            <option value="other">その他</option>
          </select>
        </Field>
        <Field label="電話番号">
          <input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} className={inp} />
        </Field>
        <Field label="メールアドレス">
          <input value={form.email || ''} onChange={(e) => set('email', e.target.value)} className={inp} />
        </Field>
        <Field label="入会日">
          <input type="date" value={form.joined_at || ''} onChange={(e) => set('joined_at', e.target.value)} className={inp} />
        </Field>
        <Field label="ステータス">
          <select value={form.status || 'active'} onChange={(e) => set('status', e.target.value)} className={inp}>
            <option value="active">アクティブ</option>
            <option value="paused">休会</option>
            <option value="withdrawn">退会</option>
          </select>
        </Field>
        <Field label="目標" full>
          <textarea value={form.goal || ''} onChange={(e) => set('goal', e.target.value)} rows={2} className={inp} />
        </Field>
        <Field label="健康状態・既往歴" full>
          <textarea value={form.health_notes || ''} onChange={(e) => set('health_notes', e.target.value)} rows={2} className={inp} />
        </Field>
        <Field label="特記事項・備考" full>
          <textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2} className={inp} />
        </Field>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          <Save size={16} /> {saving ? '保存中…' : '保存'}
        </button>
        <button onClick={remove} className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10">
          <Trash2 size={16} /> 削除
        </button>
        {savedAt && <span className="text-xs text-green-400">保存しました（{savedAt.toLocaleTimeString()}）</span>}
      </div>
    </div>
  )
}

const inp = 'w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-sm outline-none focus:border-accent'

function Field({ label, full, children }) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="mb-1 block text-xs text-gray-400">{label}</span>
      {children}
    </label>
  )
}
