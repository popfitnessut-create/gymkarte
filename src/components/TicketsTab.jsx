import { useEffect, useState } from 'react'
import { Plus, Trash2, AlertTriangle, X } from 'lucide-react'
import { fmtDate } from '../lib/format'
import { TICKET_PLANS, TICKET_SPECS, ticketExpiry } from '../lib/plans'

// 回数券タブ：購入履歴・残回数大表示・新規購入・残3回以下警告
export default function TicketsTab({ memberId }) {
  const [tickets, setTickets] = useState([])
  const [modal, setModal] = useState(false)

  const load = () => window.api.tickets.list(memberId).then(setTickets)
  useEffect(() => { load() }, [memberId])

  const remaining = tickets.reduce((s, t) => s + (t.remaining_count || 0), 0)
  const low = remaining <= 3

  const remove = async (id) => {
    if (!confirm('この回数券を削除しますか？')) return
    await window.api.tickets.remove(id)
    load()
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-stretch gap-4">
        <div className={`flex flex-col justify-center rounded-xl border px-8 py-5
          ${low ? 'border-red-500/50 bg-red-500/10' : 'border-navy-600 bg-navy-800'}`}>
          <span className="text-xs text-gray-400">現在の残回数</span>
          <span className={`text-4xl font-bold ${low ? 'text-red-400' : 'text-accent'}`}>{remaining}<span className="ml-1 text-lg font-normal text-gray-400">回</span></span>
          {low && (
            <span className="mt-1 flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle size={13} /> 残りわずかです
            </span>
          )}
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 self-start rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
          <Plus size={16} /> 新規購入
        </button>
      </div>

      <h3 className="mb-2 text-sm font-medium text-gray-300">購入履歴</h3>
      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-navy-600 p-8 text-center text-gray-500">回数券の購入履歴はありません。</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-navy-700">
          <table className="w-full text-sm">
            <thead className="bg-navy-800 text-xs text-gray-400">
              <tr>
                <th className="px-4 py-2 text-left">購入日</th>
                <th className="px-4 py-2 text-right">枚数</th>
                <th className="px-4 py-2 text-right">残回数</th>
                <th className="px-4 py-2 text-left">有効期限</th>
                <th className="px-4 py-2 text-right">金額</th>
                <th className="px-4 py-2 text-left">備考</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const expired = t.expires_at && t.expires_at < new Date().toISOString().slice(0, 10)
                return (
                  <tr key={t.id} className="border-t border-navy-700">
                    <td className="px-4 py-2.5">{fmtDate(t.purchased_at)}</td>
                    <td className="px-4 py-2.5 text-right">{t.total_count}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${t.remaining_count <= 0 ? 'text-gray-500' : t.remaining_count <= 3 ? 'text-red-400' : ''}`}>{t.remaining_count}</td>
                    <td className={`px-4 py-2.5 ${expired ? 'text-red-400' : ''}`}>{fmtDate(t.expires_at)}{expired && '（期限切れ）'}</td>
                    <td className="px-4 py-2.5 text-right">{t.price != null ? `¥${Number(t.price).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400">{t.notes || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => remove(t.id)} className="text-gray-500 hover:text-red-400"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && <PurchaseModal memberId={memberId} onClose={() => setModal(false)} onSaved={() => { setModal(false); load() }} />}
    </div>
  )
}

function PurchaseModal({ memberId, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const first = TICKET_PLANS[0]
  const [form, setForm] = useState({
    plan: first, purchased_at: today,
    total_count: TICKET_SPECS[first].count, expires_at: ticketExpiry(today),
    price: TICKET_SPECS[first].price, notes: ''
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // 購入日を変更したら有効期限（+4ヶ月・月末クランプ）を自動再計算
  const setPurchasedAt = (v) => setForm((f) => ({ ...f, purchased_at: v, expires_at: ticketExpiry(v) }))

  // 回数券種別の選択に応じて回数・価格を自動反映
  const selectPlan = (plan) => {
    const spec = TICKET_SPECS[plan]
    setForm((f) => ({ ...f, plan, total_count: spec.count, price: spec.price }))
  }

  const save = async () => {
    setSaving(true)
    await window.api.tickets.create({ member_id: memberId, ...form, notes: form.notes || form.plan })
    setSaving(false)
    onSaved()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-md rounded-xl border border-navy-600 bg-navy-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">回数券の新規購入</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <L label="回数券種別" full>
            <select value={form.plan} onChange={(e) => selectPlan(e.target.value)} className={inp}>
              {TICKET_PLANS.map((p) => <option key={p} value={p}>{p}（{TICKET_SPECS[p].count}回 / ¥{TICKET_SPECS[p].price.toLocaleString()}）</option>)}
            </select>
          </L>
          <L label="購入日"><input type="date" value={form.purchased_at} onChange={(e) => setPurchasedAt(e.target.value)} className={inp} /></L>
          <L label="枚数（回数）"><input type="number" min="1" value={form.total_count} onChange={(e) => set('total_count', e.target.value)} className={inp} /></L>
          <L label="有効期限（購入日+4ヶ月・自動／編集可）"><input type="date" value={form.expires_at} onChange={(e) => set('expires_at', e.target.value)} className={inp} /></L>
          <L label="購入金額（円）"><input type="number" min="0" value={form.price} onChange={(e) => set('price', e.target.value)} className={inp} /></L>
          <L label="備考" full><input value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inp} /></L>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-navy-600 px-4 py-2 text-sm text-gray-300 hover:bg-navy-700">キャンセル</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? '保存中…' : '購入を登録'}</button>
        </div>
      </div>
    </Overlay>
  )
}

export function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] overflow-y-auto">{children}</div>
    </div>
  )
}

export const inp = 'w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm outline-none focus:border-accent'

export function L({ label, full, children }) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="mb-1 block text-xs text-gray-400">{label}</span>
      {children}
    </label>
  )
}
