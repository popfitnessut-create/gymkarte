import { useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, AlertTriangle, X, Layers, Printer, ClipboardCheck, ChevronUp, ChevronDown, ArrowDownUp } from 'lucide-react'
import { useStore } from '../store/useStore'
import { buildIndex, runSearch, highlightName } from '../lib/search'
import { STATUS_LABEL, fmtDate, memberCode } from '../lib/format'
import NewMemberModal from '../components/NewMemberModal'

const FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'active', label: 'アクティブ' },
  { key: 'paused', label: '休会' },
  { key: 'withdrawn', label: '退会' },
  { key: 'cancelled', label: '解約' }
]

const SORTS = [
  { key: 'furigana', label: 'フリガナ順' },
  { key: 'code', label: '会員ID順' },
  { key: 'created', label: '登録順' },
  { key: 'manual', label: '手動並び替え' }
]

export default function MemberList() {
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('code')
  const [dir, setDir] = useState('asc') // 昇順/降順（手動並び替えには無効）
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [checked, setChecked] = useState([]) // マルチ展開で選択中のID
  const [evalPending, setEvalPending] = useState(new Set()) // 記録表のお渡し/印刷が未対応の会員ID
  const [evalPhase, setEvalPhase] = useState('handover')    // print | handover
  const openMember = useStore((s) => s.openMember)
  const openMulti = useStore((s) => s.openMulti)

  const MAX = 10
  const toggleCheck = (id) => setChecked((c) => {
    if (c.includes(id)) return c.filter((x) => x !== id)
    if (c.length >= MAX) { alert(`マルチ展開で選択できるのは最大${MAX}名です。`); return c }
    return [...c, id]
  })

  const load = () =>
    window.api.members.list({ status: filter, sort, dir }).then(setMembers)

  useEffect(() => { load() }, [filter, sort, dir])

  // 手動並び替え：対象を上下に1つ移動して順序を保存（手動モード・検索なし時のみ）
  const move = async (index, dir) => {
    const j = index + dir
    if (j < 0 || j >= members.length) return
    const next = members.slice()
    ;[next[index], next[j]] = [next[j], next[index]]
    setMembers(next)
    await window.api.members.reorder(next.map((m) => m.id))
  }
  const manualMode = sort === 'manual' && !query.trim()

  // パフォーマンス記録表の印刷／お渡しリマインダ（お渡し状況を保存済みの会員はSetに含まれない）
  useEffect(() => {
    window.api.evaluations.reminders().then((r) => {
      setEvalPending(new Set((r?.members || []).map((m) => m.id)))
      setEvalPhase(r?.phase || 'handover')
    })
  }, [filter])

  // フィルタ済みの会員からFuseインデックスを構築
  const fuse = useMemo(() => buildIndex(members), [members])

  // 検索クエリがあればスコア順、なければ全件
  const results = useMemo(() => {
    const r = runSearch(fuse, query)
    if (r) return r.map((res) => ({ member: res.item, parts: highlightName(res), score: res.score }))
    return members.map((m) => ({ member: m, parts: [{ text: m.name, hl: false }], score: null }))
  }, [fuse, query, members])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">会員一覧
          <span className="ml-3 text-sm font-normal text-gray-400">{members.length}名</span>
        </h1>
        <div className="flex items-center gap-3">
          {checked.length > 0 && (
            <>
              <span className="text-sm text-gray-400">{checked.length}名 選択中</span>
              <button onClick={() => setChecked([])} className="text-xs text-gray-400 hover:text-gray-100">クリア</button>
              <button
                onClick={() => openMulti(checked)}
                className="flex items-center gap-2 rounded-lg bg-accent-gold px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90"
              >
                <Layers size={18} /> マルチ展開
              </button>
            </>
          )}
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <UserPlus size={18} /> 新規会員登録
          </button>
        </div>
      </div>

      {/* 高精度検索バー */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="氏名・フリガナ・ローマ字・電話番号・会員IDで検索（あいまい検索対応）"
          className="w-full rounded-lg border border-navy-600 bg-navy-800 py-2.5 pl-10 pr-10 text-sm outline-none focus:border-accent"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-100">
            <X size={16} />
          </button>
        )}
      </div>

      {/* ステータスフィルター ＋ 並び替え */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition
              ${filter === f.key ? 'bg-accent text-white' : 'bg-navy-700 text-gray-300 hover:bg-navy-600'}`}
          >
            {f.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          <ArrowDownUp size={14} /> 並び替え
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-navy-600 bg-navy-800 px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-accent">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            disabled={sort === 'manual'}
            title={sort === 'manual' ? '手動並び替えでは無効です' : '昇順／降順を切り替え'}
            className="flex items-center gap-1 rounded-lg border border-navy-600 bg-navy-800 px-3 py-1.5 text-xs text-gray-200 hover:border-accent disabled:opacity-40">
            {dir === 'asc' ? <><ChevronUp size={13} /> 昇順</> : <><ChevronDown size={13} /> 降順</>}
          </button>
        </label>
      </div>

      {manualMode && (
        <p className="mb-2 text-[11px] text-gray-400">手動並び替えモード：各行の上下ボタンで順番を入れ替えできます（この順番は保存されます）。</p>
      )}
      {sort === 'manual' && query.trim() && (
        <p className="mb-2 text-[11px] text-amber-600">検索中は手動並び替えできません。検索を解除してください。</p>
      )}

      {/* 会員テーブル */}
      <div className="overflow-hidden rounded-xl border border-navy-700">
        <table className="w-full text-sm">
          <thead className="bg-navy-800 text-gray-400">
            <tr>
              <th className="w-10 px-4 py-3"></th>
              <th className="px-4 py-3 text-left font-medium">会員ID</th>
              <th className="px-4 py-3 text-left font-medium">氏名 / フリガナ</th>
              <th className="px-4 py-3 text-left font-medium">電話番号</th>
              <th className="px-4 py-3 text-center font-medium">残回数</th>
              <th className="px-4 py-3 text-left font-medium">最終来店</th>
              <th className="px-4 py-3 text-center font-medium">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">該当する会員がいません</td></tr>
            )}
            {results.map(({ member: m, parts }, idx) => {
              const low = m.remaining_count <= 3
              const isChecked = checked.includes(m.id)
              return (
                <tr
                  key={m.id}
                  onClick={() => openMember(m.id)}
                  className={`cursor-pointer border-t border-navy-700 hover:bg-navy-800 ${isChecked ? 'bg-navy-800' : ''}`}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {manualMode ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <button onClick={() => move(idx, -1)} disabled={idx === 0}
                          title="上へ" className="text-gray-400 hover:text-accent disabled:opacity-30">
                          <ChevronUp size={15} />
                        </button>
                        <button onClick={() => move(idx, 1)} disabled={idx === results.length - 1}
                          title="下へ" className="text-gray-400 hover:text-accent disabled:opacity-30">
                          <ChevronDown size={15} />
                        </button>
                      </div>
                    ) : (
                      <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(m.id)} className="h-4 w-4 accent-accent-gold" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{memberCode(m)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      <span>{parts.map((p, i) => p.hl ? <mark key={i} className="hl">{p.text}</mark> : <span key={i}>{p.text}</span>)}</span>
                      {evalPending.has(m.id) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                          title="パフォーマンス記録表のお渡し状況が未記録です">
                          {evalPhase === 'print'
                            ? <><Printer size={11} /> 要印刷</>
                            : <><ClipboardCheck size={11} /> 未お渡し</>}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{m.furigana || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{m.phone || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 font-semibold ${low ? 'text-red-400' : 'text-gray-100'}`}>
                      {low && <AlertTriangle size={14} />}{m.remaining_count}回
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{fmtDate(m.last_visit)}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewMemberModal
          onClose={() => setShowNew(false)}
          onCreated={(m) => { setShowNew(false); openMember(m.id) }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    active: 'bg-green-500/20 text-green-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    withdrawn: 'bg-gray-500/20 text-gray-400',
    cancelled: 'bg-red-500/20 text-red-400'
  }
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] || map.withdrawn}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}
