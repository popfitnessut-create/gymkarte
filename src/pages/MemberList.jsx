import { useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, AlertTriangle, X, Layers } from 'lucide-react'
import { useStore } from '../store/useStore'
import { buildIndex, runSearch, highlightName } from '../lib/search'
import { STATUS_LABEL, fmtDate } from '../lib/format'
import NewMemberModal from '../components/NewMemberModal'

const FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'active', label: 'アクティブ' },
  { key: 'paused', label: '休会' },
  { key: 'withdrawn', label: '退会' }
]

export default function MemberList() {
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [checked, setChecked] = useState([]) // マルチ展開で選択中のID
  const openMember = useStore((s) => s.openMember)
  const openMulti = useStore((s) => s.openMulti)

  const MAX = 10
  const toggleCheck = (id) => setChecked((c) => {
    if (c.includes(id)) return c.filter((x) => x !== id)
    if (c.length >= MAX) { alert(`マルチ展開で選択できるのは最大${MAX}名です。`); return c }
    return [...c, id]
  })

  const load = () =>
    window.api.members.list({ status: filter }).then(setMembers)

  useEffect(() => { load() }, [filter])

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

      {/* ステータスフィルター */}
      <div className="mb-4 flex gap-2">
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
      </div>

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
            {results.map(({ member: m, parts }) => {
              const low = m.remaining_count <= 3
              const isChecked = checked.includes(m.id)
              return (
                <tr
                  key={m.id}
                  onClick={() => openMember(m.id)}
                  className={`cursor-pointer border-t border-navy-700 hover:bg-navy-800 ${isChecked ? 'bg-navy-800' : ''}`}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(m.id)} className="h-4 w-4 accent-accent-gold" />
                  </td>
                  <td className="px-4 py-3 text-gray-400">#{String(m.id).padStart(4, '0')}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {parts.map((p, i) => p.hl ? <mark key={i} className="hl">{p.text}</mark> : <span key={i}>{p.text}</span>)}
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
    withdrawn: 'bg-gray-500/20 text-gray-400'
  }
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] || map.withdrawn}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}
