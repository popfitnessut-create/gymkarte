import { useEffect, useState } from 'react'
import { Users, UserCheck, CalendarCheck, AlertTriangle, TicketCheck, Printer, ClipboardCheck, CreditCard, ClipboardList, Gift, Check } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useStore } from '../store/useStore'
import { fmtYearMonth } from '../lib/evaluation'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [reminder, setReminder] = useState(null)
  const [billing, setBilling] = useState([])
  const [procAlerts, setProcAlerts] = useState([])
  const [annivAlerts, setAnnivAlerts] = useState([])
  const openMember = useStore((s) => s.openMember)
  const openMemberAt = useStore((s) => s.openMemberAt)

  const loadBilling = () => window.api.members.billingPending().then(setBilling)
  const loadProc = () => window.api.procedures.alerts().then(setProcAlerts)
  const loadAnniv = () => window.api.anniversary.alerts().then(setAnnivAlerts)

  useEffect(() => {
    window.api.stats.dashboard().then(setData)
    window.api.evaluations.reminders().then(setReminder)
    loadBilling(); loadProc(); loadAnniv()
  }, [])

  if (!data) return <div className="p-8 text-gray-400">読み込み中…</div>

  const todayCount = data.todayVisits.length

  const dismissBilling = async (id) => { await window.api.members.setBillingDone(id); loadBilling() }
  const dismissProc = async (id) => { await window.api.procedures.setDone(id); loadProc() }
  const dismissAnniv = async (a) => { await window.api.anniversary.setDone({ member_id: a.member_id, years: a.years }); loadAnniv() }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold">ダッシュボード</h1>

      {/* 新規会員：会費ペイ 初回継続課金日変更アラート */}
      {billing.length > 0 && (
        <BillingAlert members={billing} onDone={dismissBilling} openMember={openMember} />
      )}

      {/* 手続き：会費ペイ コース削除／編集アラート */}
      {procAlerts.length > 0 && (
        <ProcedureAlert items={procAlerts} onDone={dismissProc} openMember={openMember} />
      )}

      {/* 在籍記念品アラート */}
      {annivAlerts.length > 0 && (
        <AnniversaryAlert items={annivAlerts} onDone={dismissAnniv} openMember={openMember} />
      )}

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

// 新規会員の「会費ペイ 初回継続課金日変更」アラート
function BillingAlert({ members, onDone, openMember }) {
  return (
    <div className="mb-6 rounded-xl border border-accent/50 bg-accent/10 p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-100">
        <CreditCard size={16} className="text-accent" /> 会費ペイ 初回継続課金日の変更（新規会員 {members.length}名）
      </div>
      <p className="mb-3 text-xs text-gray-400">会費ペイで初回継続課金日を変更したら「変更済み」を押してください。</p>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-navy-600 bg-navy-900 px-3 py-2">
            <button onClick={() => openMember(m.id)} className="text-left text-sm hover:text-accent">
              会費ペイにて<span className="font-medium">{m.name}</span>様の初回継続課金日の変更を行なってください
            </button>
            <button onClick={() => onDone(m.id)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-accent/40 px-2.5 py-1 text-[11px] text-accent hover:bg-accent/10">
              <Check size={12} /> 変更済み
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// 手続き受付の「会費ペイ コース削除／編集」アラート
function ProcedureAlert({ items, onDone, openMember }) {
  return (
    <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/5 p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-100">
        <ClipboardList size={16} className="text-red-400" /> 会費ペイ 手続き対応（{items.length}件）
      </div>
      <p className="mb-3 text-xs text-gray-400">会費ペイで対象会員のコース削除／編集を行ったら「実施済み」を押してください。</p>
      <div className="space-y-2">
        {items.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-navy-600 bg-navy-900 px-3 py-2">
            <button onClick={() => openMember(p.member_id)} className="text-left text-sm hover:text-accent">
              会費ペイにて<span className="font-medium">{p.name}</span>様のコース{p.action === 'delete' ? '削除' : '編集'}を実施してください。
            </button>
            <button onClick={() => onDone(p.id)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-red-500/40 px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-500/10">
              <Check size={12} /> 実施済み
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// 在籍記念品アラート（1/2/3年）
function AnniversaryAlert({ items, onDone, openMember }) {
  return (
    <div className="mb-6 rounded-xl border border-accent-gold/50 bg-accent-gold/10 p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-100">
        <Gift size={16} className="text-accent-gold" /> 在籍記念品の贈呈対象（{items.length}名）
      </div>
      <p className="mb-3 text-xs text-gray-400">記念品をお渡ししたら「贈呈済み」を押してください。</p>
      <div className="space-y-2">
        {items.map((a) => (
          <div key={`${a.member_id}-${a.years}`} className="flex items-center justify-between rounded-lg border border-navy-600 bg-navy-900 px-3 py-2">
            <button onClick={() => openMember(a.member_id)} className="text-left text-sm hover:text-accent">
              <span className="font-medium">{a.name}</span>様の在籍{a.years}年が経過しました。記念品贈呈対象です。
            </button>
            <button onClick={() => onDone(a)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-accent-gold/40 px-2.5 py-1 text-[11px] text-accent-gold hover:bg-accent-gold/10">
              <Check size={12} /> 贈呈済み
            </button>
          </div>
        ))}
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
