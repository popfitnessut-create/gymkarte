import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Check, X, Search, CircleCheck, Clock } from 'lucide-react'

// 手続き種別の定義（表示順・ラベル・受付後にすべき会費ペイ操作）
const TYPES = [
  { key: 'cancel', label: '月額プラン解約手続き', action: 'コース削除' },
  { key: 'pause', label: '月額プラン休会手続き', action: 'コース編集' },
  { key: 'transfer', label: '移行手続き', action: 'コース編集' },
  { key: 'option_cancel', label: 'オプション解約手続き', action: 'コース削除' }
]
const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.key, t]))

const inp = 'w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm outline-none focus:border-accent'

export default function Procedures() {
  const [members, setMembers] = useState([])
  const [list, setList] = useState([])
  const [type, setType] = useState('cancel')
  const [memberId, setMemberId] = useState(null)
  const [received, setReceived] = useState(new Date().toISOString().slice(0, 10))
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = () => window.api.procedures.list().then(setList)
  useEffect(() => {
    window.api.members.list({ status: 'all', sort: 'furigana', dir: 'asc' }).then(setMembers)
    reload()
  }, [])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return members
    return members.filter((m) =>
      [m.name, m.furigana, m.member_code].filter(Boolean).some((v) => String(v).toLowerCase().includes(k)))
  }, [members, q])

  const selected = members.find((m) => m.id === memberId)

  const submit = async () => {
    if (!memberId) { alert('会員を選択してください'); return }
    setSaving(true)
    const res = await window.api.procedures.create({ member_id: memberId, type, received_at: received })
    setSaving(false)
    if (!res || !res.ok) { alert('登録に失敗しました'); return }
    setMemberId(null); setQ('')
    reload()
  }

  const markDone = async (id) => { await window.api.procedures.setDone(id); reload() }
  const remove = async (id) => {
    if (!confirm('この受付を取り消しますか？')) return
    await window.api.procedures.remove(id); reload()
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold">
        <ClipboardList size={24} className="text-accent" /> 手続き
      </h1>

      <div className="grid grid-cols-2 gap-6">
        {/* 受付フォーム */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-200">手続きを受け付ける</h2>

          <div className="mb-4">
            <span className="mb-2 block text-xs text-gray-400">手続きの種類</span>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => setType(t.key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition
                    ${type === t.key ? 'border-accent bg-accent/10 text-gray-100' : 'border-navy-600 bg-navy-900 text-gray-300 hover:border-navy-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <span className="mb-2 block text-xs text-gray-400">対象会員</span>
            {selected ? (
              <div className="flex items-center justify-between rounded-lg border border-accent bg-accent/10 px-3 py-2">
                <span className="text-sm font-medium">{selected.name}
                  {selected.member_code && <span className="ml-2 text-[11px] text-gray-400">ID {selected.member_code}</span>}</span>
                <button onClick={() => setMemberId(null)} className="text-gray-400 hover:text-gray-100"><X size={16} /></button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inp} pl-9`} placeholder="氏名・フリガナ・会員IDで検索" />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-navy-600 bg-navy-900">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-gray-500">該当する会員がいません</p>
                  ) : filtered.map((m) => (
                    <button key={m.id} onClick={() => setMemberId(m.id)}
                      className="flex w-full items-center justify-between border-b border-navy-700 px-3 py-2 text-left text-sm last:border-0 hover:bg-navy-800">
                      <span>{m.name}{m.furigana && <span className="ml-2 text-[11px] text-gray-400">{m.furigana}</span>}</span>
                      {m.member_code && <span className="text-[11px] text-gray-500">ID {m.member_code}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="mb-5">
            <span className="mb-1 block text-xs text-gray-400">受付日</span>
            <input type="date" value={received} onChange={(e) => setReceived(e.target.value)} className={inp} />
          </div>

          <button onClick={submit} disabled={saving || !memberId}
            className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving ? '登録中…' : 'この手続きを受け付ける'}
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
            受付後、表示期間（受付1〜10日→当月14日〜翌月12日／11日以降→翌月14日〜翌々月12日）に入ると
            ダッシュボードへ「会費ペイで{TYPE_MAP[type].action}」のアラートが表示されます。
          </p>
        </div>

        {/* 受付履歴 */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-200">受付履歴（{list.length}件）</h2>
          {list.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">まだ受付はありません</p>
          ) : (
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {list.map((p) => (
                <div key={p.id} className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{p.name}
                        <span className="ml-2 text-[11px] text-gray-400">{(TYPE_MAP[p.type] || {}).label || p.type}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500">受付 {p.received_at}</div>
                    </div>
                    {p.done ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-green-500/10 px-2 py-1 text-[11px] font-medium text-green-400">
                        <CircleCheck size={13} /> 実施済み
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400">
                        <Clock size={13} /> 実施待ち
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    {!p.done && (
                      <button onClick={() => markDone(p.id)}
                        className="flex items-center gap-1 rounded-md border border-green-500/40 px-2 py-1 text-[11px] text-green-400 hover:bg-green-500/10">
                        <Check size={12} /> 実施済みにする
                      </button>
                    )}
                    <button onClick={() => remove(p.id)}
                      className="flex items-center gap-1 rounded-md border border-navy-600 px-2 py-1 text-[11px] text-gray-400 hover:bg-navy-800">
                      <X size={12} /> 取り消し
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
