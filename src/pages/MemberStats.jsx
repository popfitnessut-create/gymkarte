import { useEffect, useState } from 'react'
import { BarChart3, Info } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { tooltipStyle } from './Dashboard'

const fmtYM = (ym) => {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return `${y}年${Number(m)}月`
}
const fmtRate = (r) => (r == null ? '—' : `${r}%`)

export default function MemberStats() {
  const [data, setData] = useState(null)

  useEffect(() => { window.api.procedures.stats().then(setData) }, [])

  if (!data) return <div className="p-8 text-gray-400">読み込み中…</div>

  const chart = data.months.map((r) => ({
    label: `${Number(r.ym.split('-')[1])}月`,
    解約率: r.cancelRate ?? 0, 休会率: r.pauseRate ?? 0, 移行率: r.transferRate ?? 0
  }))

  return (
    <div className="p-8">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold">
        <BarChart3 size={24} className="text-accent" /> 会員統計
      </h1>

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-navy-700 bg-navy-800 px-4 py-3 text-xs text-gray-400">
        <Info size={15} className="mt-0.5 shrink-0 text-accent" />
        <p className="leading-relaxed">
          各率＝その月の手続き件数 ÷ <span className="text-gray-200">月初の月額会員数</span>。
          月初の月額会員数は「月額プラン会員のうち、入会日が月初以前で、それ以前の月に解約手続きがない会員数」として算出しています。
          手続きは「手続き」タブで受け付けた記録に基づきます。
        </p>
      </div>

      {/* 推移グラフ */}
      <div className="mb-6 rounded-xl border border-navy-700 bg-navy-800 p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-300">直近12か月の率の推移</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chart} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243154" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#243154' }} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="解約率" stroke="#f87171" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="休会率" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="移行率" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 明細テーブル */}
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-300">月別明細</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 text-left text-xs text-gray-400">
                <th className="px-3 py-2 font-medium">月</th>
                <th className="px-3 py-2 text-right font-medium">月初会員数</th>
                <th className="px-3 py-2 text-right font-medium">解約</th>
                <th className="px-3 py-2 text-right font-medium">解約率</th>
                <th className="px-3 py-2 text-right font-medium">休会</th>
                <th className="px-3 py-2 text-right font-medium">休会率</th>
                <th className="px-3 py-2 text-right font-medium">移行</th>
                <th className="px-3 py-2 text-right font-medium">移行率</th>
              </tr>
            </thead>
            <tbody>
              {[...data.months].reverse().map((r) => (
                <tr key={r.ym} className="border-b border-navy-700/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{fmtYM(r.ym)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{r.denom}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{r.cancel}</td>
                  <td className="px-3 py-2 text-right text-red-400">{fmtRate(r.cancelRate)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{r.pause}</td>
                  <td className="px-3 py-2 text-right text-amber-400">{fmtRate(r.pauseRate)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{r.transfer}</td>
                  <td className="px-3 py-2 text-right text-blue-400">{fmtRate(r.transferRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
