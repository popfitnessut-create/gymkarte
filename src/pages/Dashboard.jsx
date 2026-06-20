import { useEffect, useState } from 'react'
import { Users, UserCheck, CalendarCheck, AlertTriangle, TicketCheck, Printer, ClipboardCheck } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useStore } from '../store/useStore'
import { fmtYearMonth } from '../lib/evaluation'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [reminder, setReminder] = useState(null)
  const openMember = useStore((s) => s.openMember)
  const openMemberAt = useStore((s) => s.openMemberAt)

  useEffect(() => {
    window.api.stats.dashboard().then(setData)
    window.api.evaluations.reminders().then(setReminder)
  }, [])

  if (!data) return <div className="p-8 text-gray-400">読み込み中…</div>

  const todayCount = data.todayVisits.length

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold">ダッシュボード</h1>

      {/* パフォーマンス記録表 印刷／お渡しリマインダ */}
      {reminder && reminder.members.length > 0 && (
        <EvalReminder reminder={reminder} openMember={openMember} openMemberAt={openMemberAt} />
      )}

      {/* サマリーカード */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <SummaryCard icon={Users} label="全会員数" value={data.totalMembers} color="text-accent" />
        <SummaryCard icon={UserCheck} label="アクティブ会員" value={data.activeMembers} color="text-green-400" />
        <SummaryCard icon={CalendarCheck} label="本日の来店" value={todayCount} suffix="名" color="text-accent" />
        <SummaryCard icon={AlertTriangle} label="残数アラート" value={data.lowTickets.length} suffix="名" color={data.lowTickets.length ? 'text-red-400' : 'text-gray-300'} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 来店数グラフ */}
        <div className="col-span-2 rounded-xl border border-navy-700 bg-navy-800 p-5">
          <h2 className="mb-4 text-sm font-medium text-gray-300">直近7日間の来店数</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.week} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#243154" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#243154' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1a2440' }} labelFormatter={(l) => `${l}`} formatter={(v) => [`${v}件`, '来店']} />
              <Bar dataKey="count" fill="#2f81f7" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 残数アラート */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
            <TicketCheck size={16} className="text-red-400" /> 回数券 残数アラート（残2回以下）
          </h2>
          {data.lowTickets.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">アラート対象はいません</p>
          ) : (
            <div className="space-y-2">
              {data.lowTickets.map((m) => (
                <button key={m.id} onClick={() => openMember(m.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-left hover:bg-red-500/10">
                  <div>
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-[11px] text-gray-400">{m.furigana || ''}</div>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-semibold text-red-400">
                    <AlertTriangle size={13} />残{m.remaining}回
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 本日の来店リスト */}
      <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800 p-5">
        <h2 className="mb-3 text-sm font-medium text-gray-300">本日の来店（{todayCount}名）</h2>
        {todayCount === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">本日の来店記録はまだありません</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.todayVisits.map((v) => (
              <button key={v.id} onClick={() => openMember(v.member_id)}
                className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm hover:border-accent">
                <span className="font-medium">{v.name}</span>
                {v.trainer_name && <span className="ml-2 text-[11px] text-gray-400">{v.trainer_name}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EvalReminder({ reminder, openMember, openMemberAt }) {
  const isPrint = reminder.phase === 'print'
  // リマインダの対象月でパフォーマンス記録表タブを直接開く。
  // これにより、お渡し記録がリマインダと同じ月に保存され、記録後にアラートが消える。
  const open = (id) => {
    if (openMemberAt) openMemberAt(id, { tab: 'evaluation', ym: reminder.targetYM })
    else openMember(id)
  }
  const Icon = isPrint ? Printer : ClipboardCheck
  const title = isPrint
    ? `パフォーマンス記録表の印刷時期です（${fmtYearMonth(reminder.targetYM)}）`
    : `パフォーマンス記録表のお渡し状況を確認してください（${fmtYearMonth(reminder.targetYM)}）`
  const sub = isPrint
    ? '月末が近づいています。下記の会員のパフォーマンス記録表を印刷しましょう。'
    : 'お渡し状況（お渡し済み／未お渡し／発行なし）を記録すると、このアラートは消えます。'
  return (
    <div className="mb-6 rounded-xl border border-accent-gold/50 bg-accent-gold/10 p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-100">
        <Icon size={16} className="text-accent-gold" /> {title}
      </div>
      <p className="mb-3 text-xs text-gray-400">{sub}（対象 {reminder.members.length}名）</p>
      <div className="flex flex-wrap gap-2">
        {reminder.members.map((m) => (
          <button key={m.id} onClick={() => open(m.id)}
            className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm hover:border-accent">
            <span className="font-medium">{m.name}</span>
            {m.furigana && <span className="ml-2 text-[11px] text-gray-400">{m.furigana}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, suffix, color }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
        <Icon size={15} /> {label}
      </div>
      <div className={`text-3xl font-bold ${color}`}>{value}<span className="ml-1 text-sm font-normal text-gray-400">{suffix}</span></div>
    </div>
  )
}

export const tooltipStyle = { background: '#111a2e', border: '1px solid #243154', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }
