import { useState } from 'react'
import { X } from 'lucide-react'

// 新規会員登録モーダル（基本情報の最小入力）
export default function NewMemberModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', furigana: '', phone: '', gender: 'male',
    birthdate: '', joined_at: new Date().toISOString().slice(0, 10), status: 'active'
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { alert('氏名は必須です'); return }
    setSaving(true)
    const created = await window.api.members.create(form)
    setSaving(false)
    onCreated(created)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-navy-700 bg-navy-800 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">新規会員登録</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="氏名（漢字）*" full>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inp} />
          </Field>
          <Field label="フリガナ" full>
            <input value={form.furigana} onChange={(e) => set('furigana', e.target.value)} className={inp} placeholder="カタカナ" />
          </Field>
          <Field label="電話番号">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inp} />
          </Field>
          <Field label="性別">
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className={inp}>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
          </Field>
          <Field label="生年月日">
            <input type="date" value={form.birthdate} onChange={(e) => set('birthdate', e.target.value)} className={inp} />
          </Field>
          <Field label="入会日">
            <input type="date" value={form.joined_at} onChange={(e) => set('joined_at', e.target.value)} className={inp} />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-navy-700">キャンセル</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving ? '保存中…' : '登録'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inp = 'w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm outline-none focus:border-accent'

function Field({ label, full, children }) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="mb-1 block text-xs text-gray-400">{label}</span>
      {children}
    </label>
  )
}
