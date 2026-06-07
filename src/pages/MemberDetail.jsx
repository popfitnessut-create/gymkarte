import { useEffect, useState } from 'react'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { calcAge, memberCode } from '../lib/format'
import { PLAN_TYPES, planOptions } from '../lib/plans'
import TicketsTab from '../components/TicketsTab'
import SessionsTab from '../components/SessionsTab'
import AnalyticsTab from '../components/AnalyticsTab'
import DailyListTab from '../components/DailyListTab'

const tabsFor = (member) => [
  { key: 'basic', label: '基本情報' },
  { key: 'tickets', label: member?.plan_type === 'monthly' ? '月額プラン' : '回数券' },
  { key: 'sessions', label: 'セッション記録' },
  { key: 'daily', label: '日次カルテ一覧' },
  { key: 'analytics', label: '分析' }
]

export default function MemberDetail() {
  const id = useStore((s) => s.selectedMemberId)
  const back = useStore((s) => s.backToList)
  const [tab, setTab] = useState('basic')
  const [member, setMember] = useState(null)
  const [pendingSession, setPendingSession] = useState(null) // 回数券残0で保留中のセッション

  useEffect(() => {
    if (id) window.api.members.get(id).then(setMember)
  }, [id])

  // タブ手動切替時は保留中セッションを破棄（購入を中断したケース）
  const goTab = (key) => { setPendingSession(null); setTab(key) }

  // 回数券残0で保存しようとした → 入力内容を保持し、購入タブへ自動遷移
  const handleRequirePurchase = (payload) => {
    setPendingSession(payload)
    setTab('tickets')
    alert('回数券が残0です。\n回数券を購入すると、入力中のセッションが自動的に保存されます。')
  }

  // 回数券購入が完了 → 保留中セッションがあれば自動保存してセッション記録へ戻る
  const handlePurchased = async () => {
    if (!pendingSession) return
    await window.api.sessions.create(pendingSession)
    setPendingSession(null)
    setTab('sessions')
    alert('回数券を購入し、セッション記録を保存しました。')
  }

  if (!member) return <div className="p-8 text-gray-400">読み込み中…</div>

  return (
    <div className="p-8">
      <button onClick={back} className="mb-4 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-100">
        <ArrowLeft size={16} /> 会員一覧に戻る
      </button>

      <div className="mb-1 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">{member.name}</h1>
        <span className="text-sm text-gray-400">{member.furigana}</span>
        <span className="text-xs text-gray-500">{memberCode(member)}</span>
      </div>

      {/* タブ */}
      <div className="mb-6 mt-4 flex gap-1 border-b border-navy-700">
        {tabsFor(member).map((t) => (
          <button
            key={t.key}
            onClick={() => goTab(t.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition
              ${tab === t.key ? 'text-accent' : 'text-gray-400 hover:text-gray-100'}`}
          >
            {t.label}
            {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
          </button>
        ))}
      </div>

      {tab === 'basic' && <BasicInfoTab member={member} onSaved={setMember} />}
      {tab === 'tickets' && <TicketsTab memberId={member.id} onPurchased={handlePurchased} />}
      {tab === 'sessions' && <SessionsTab memberId={member.id} member={member} onRequirePurchase={handleRequirePurchase} />}
      {tab === 'daily' && <DailyListTab memberId={member.id} />}
      {tab === 'analytics' && <AnalyticsTab memberId={member.id} />}
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
        <Field label="会員ID（手動入力・任意）">
          <input value={form.member_code || ''} onChange={(e) => set('member_code', e.target.value)} className={inp} placeholder="空欄なら自動採番IDを表示" />
        </Field>
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
            <option value="cancelled">解約</option>
          </select>
        </Field>
        <Field label="プラン種別">
          <select value={form.plan_type || 'ticket'} onChange={(e) => {
            const pt = e.target.value
            setForm((f) => ({ ...f, plan_type: pt, plan_name: planOptions(pt)[0] }))
          }} className={inp}>
            {PLAN_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="プラン名">
          <select value={form.plan_name || ''} onChange={(e) => set('plan_name', e.target.value)} className={inp}>
            <option value="">未選択</option>
            {planOptions(form.plan_type || 'ticket').map((n) => <option key={n} value={n}>{n}</option>)}
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

      {/* 初回カウンセリングカルテ */}
      <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800 p-4">
        <h3 className="mb-2 text-sm font-medium text-accent">初回カウンセリングカルテ</h3>
        <textarea
          value={form.counseling_notes || ''}
          onChange={(e) => set('counseling_notes', e.target.value)}
          rows={6}
          placeholder="初回カウンセリングの内容（目標・運動歴・生活習慣・要望・既往歴の詳細など）を記録"
          className={inp}
        />
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
