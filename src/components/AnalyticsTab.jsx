import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { fmtDate } from '../lib/format'
import { tooltipStyle } from '../pages/Dashboard'

const COLORS = ['#2f81f7', '#e3b341', '#34d399', '#f87171', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6', '#84cc16', '#94a3b8', '#facc15', '#38bdf8', '#c084fc']

// 鍛えた部位のグルーピング定義（下半身 / 肩 / 腕）。未定義の部位は単独表示。
const MUSCLE_GROUP = {
  '大腿四頭筋': '下半身', 'ハムストリングス': '下半身', '臀部': '下半身', 'ふくらはぎ': '下半身', '脚全体': '下半身',
  '肩(前)': '肩', '肩(後)': '肩', '肩(後ろ)': '肩', '僧帽筋': '肩',
  '上腕二頭筋': '腕', '上腕三頭筋': '腕', '前腕': '腕'
}

// 分析タブ：来店頻度・部位割合・重量推移・体重体脂肪・サマリー
export default function AnalyticsTab({ memberId }) {
  const [d, setD] = useState(null)
  const [exName, setExName] = useState(null)

  useEffect(() => {
    window.api.stats.memberAnalytics(memberId).then((res) => {
      setD(res)
      const names = Object.keys(res.exercises || {})
      if (names.length) setExName(names[0])
    })
  }, [memberId])

  // 部位をグルーピングして集計し、割合（％）を付与
  const muscleData = useMemo(() => {
    const src = d?.muscles || []
    const agg = {}
    for (const m of src) {
      const key = MUSCLE_GROUP[m.name] || m.name
      agg[key] = (agg[key] || 0) + (m.value || 0)
    }
    const total = Object.values(agg).reduce((s, v) => s + v, 0)
    return Object.entries(agg)
      .map(([name, value]) => ({ name, value, pct: total ? Math.round((value / total) * 100) : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [d])

  const exData = useMemo(() => {
    if (!d || !exName) return []
    // 同日複数記録は最大重量を採用
    const byDate = {}
    for (const r of d.exercises[exName]) byDate[r.date] = Math.max(byDate[r.date] ?? 0, r.weight)
    return Object.entries(byDate).map(([date, weight]) => ({ date: date.slice(5), weight }))
  }, [d, exName])

  if (!d) return <div className="text-gray-400">読み込み中…</div>

  const hasAny = d.totalVisits > 0
  const exNames = Object.keys(d.exercises || {})

  return (
    <div className="max-w-5xl space-y-6">
      {/* サマリー */}
      <div className="grid grid-cols-4 gap-4">
        <Stat label="総来店回数" value={d.totalVisits} suffix="回" />
        <Stat label="平均来店ペース" value={d.avgPerWeek != null ? d.avgPerWeek : '—'} suffix={d.avgPerWeek != null ? '回/週' : ''} />
        <Stat label="初回来店" value={fmtDate(d.firstVisit)} small />
        <Stat label="最終来店" value={fmtDate(d.lastVisit)} small />
      </div>

      {!hasAny && (
        <div className="rounded-xl border border-dashed border-navy-600 p-10 text-center text-gray-500">
          分析するセッションデータがまだありません。
        </div>
      )}

      {hasAny && (
        <>
          <div className="grid grid-cols-2 gap-6">
            {/* 来店頻度（月別） */}
            <Panel title="来店頻度（月別）">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={d.monthly} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#243154" vertical={false} />
                  <XAxis dataKey="ym" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#243154' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}回`, '来店']} />
                  <Line type="monotone" dataKey="c" stroke="#2f81f7" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            {/* 部位割合（下半身/肩/腕にグルーピング・割合％表示） */}
            <Panel title="鍛えた部位の割合">
              {muscleData.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={muscleData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}
                      labelLine={false} label={({ pct }) => (pct >= 8 ? `${pct}%` : '')}>
                      {muscleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n, p) => [`${v}回（${p?.payload?.pct ?? 0}%）`, n]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                      formatter={(value, entry) => `${value} ${entry?.payload?.pct ?? 0}%`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* 種目別 重量推移 */}
          <Panel title="重量の伸び推移（種目別）"
            action={exNames.length > 0 && (
              <select value={exName || ''} onChange={(e) => setExName(e.target.value)}
                className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-1.5 text-xs outline-none focus:border-accent">
                {exNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}>
            {exNames.length === 0 ? <Empty text="重量を記録した種目がありません" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={exData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#243154" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#243154' }} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} unit="kg" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}kg`, exName]} />
                  <Line type="monotone" dataKey="weight" stroke="#e3b341" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* 体重・体脂肪推移 */}
          <Panel title="体重・体脂肪率の推移（日次カルテより）">
            {d.body.length === 0 ? <Empty text="日次カルテに体重・体脂肪の記録がありません" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={d.body.map((b) => ({ ...b, date: b.date.slice(5) }))} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#243154" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#243154' }} tickLine={false} />
                  <YAxis yAxisId="w" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} unit="kg" />
                  <YAxis yAxisId="f" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Line yAxisId="w" type="monotone" dataKey="weight_kg" name="体重(kg)" stroke="#2f81f7" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line yAxisId="f" type="monotone" dataKey="body_fat_pct" name="体脂肪率(%)" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, suffix, small }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`font-bold text-accent ${small ? 'text-base' : 'text-2xl'}`}>{value}<span className="ml-1 text-xs font-normal text-gray-400">{suffix}</span></div>
    </div>
  )
}

function Panel({ title, action, children }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ text = 'データがありません' }) {
  return <div className="flex h-[200px] items-center justify-center text-sm text-gray-500">{text}</div>
}
