import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Save, Dumbbell, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { usageLabel, MUSCLE_OPTIONS, MONTHLY_LIMITS } from '../lib/plans'

// セッション記録タブ：行カード型。新規は下へ追加。日次カルテ統合。
export default function SessionsTab({ memberId, member, onRequirePurchase }) {
  const [sessions, setSessions] = useState([])
  const [ticketRemaining, setTicketRemaining] = useState(0)
  const [trainers, setTrainers] = useState([])
  const [presets, setPresets] = useState([])
  const [draft, setDraft] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  const planType = member?.plan_type || 'ticket'
  const planName = member?.plan_name || ''
  const monthlyLimit = MONTHLY_LIMITS[planName] // ポッププラン=4 など

  const load = () => {
    window.api.sessions.list(memberId).then(setSessions)
    window.api.tickets.remaining(memberId).then(setTicketRemaining)
  }
  useEffect(() => { load() }, [memberId])
  useEffect(() => {
    window.api.trainers.list().then(setTrainers)
    window.api.presets.list().then(setPresets)
  }, [])

  // 回数券：各セッション時点の残数を日付順に都度カウントダウン（残8→残7…）
  const ticketRemainById = useMemo(() => {
    const map = {}
    if (planType !== 'ticket') return map
    const consumedCount = sessions.filter((s) => s.ticket_id != null).length
    const initial = ticketRemaining + consumedCount // 購入総数の推定
    let used = 0
    // sessionsは日付昇順
    for (const s of sessions) {
      if (s.ticket_id != null) used += 1
      map[s.id] = initial - used
    }
    return map
  }, [sessions, ticketRemaining, planType])

  // 残数の表示計算（セッション単位）
  const remainingFor = (session) => {
    if (planType === 'ticket') {
      if (!session) return ticketRemaining // 新規ドラフトは現在残数
      return ticketRemainById[session.id] ?? ticketRemaining
    }
    if (monthlyLimit != null) {
      // 当該セッションの月の利用回数から残りを計算
      const ym = (session?.session_date || new Date().toISOString().slice(0, 10)).slice(0, 7)
      const used = sessions.filter((s) => String(s.session_date || '').slice(0, 7) === ym).length
      return Math.max(0, monthlyLimit - used)
    }
    return '―' // 無制限の月額プラン
  }

  // 月額プランは当月上限で新規入力をブロック。回数券は残0でも入力可（保存時に購入を促す）。
  const monthlyLimitReached = monthlyLimit != null && remainingFor(null) <= 0
  const ticketEmpty = planType === 'ticket' && ticketRemaining <= 0

  const remove = async (id) => {
    if (!confirm('このカルテを削除しますか？回数券会員の場合、消費した1回が戻ります。')) return
    await window.api.sessions.remove(id)
    load()
  }

  const save = async (payload, id) => {
    // 回数券ガード：残0なら保存せず、入力内容を保持したまま購入フローへ渡す。
    // 購入完了後に MemberDetail 側でこのセッションが自動保存される。
    if (!id && planType === 'ticket' && ticketRemaining <= 0) {
      onRequirePurchase?.(payload)
      return
    }
    if (id) await window.api.sessions.update({ id, ...payload })
    else await window.api.sessions.create(payload)
    setDraft(false)
    load()
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 3000)
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          プラン <span className="font-medium text-gray-100">{usageLabel(member)}</span>
          　/　カルテ数 <span className="font-medium text-gray-100">{sessions.length}</span>
          {planType === 'ticket' && <>　/　回数券残 <span className="font-medium text-accent">{ticketRemaining}</span></>}
          {monthlyLimit != null && <>　/　今月残 <span className="font-medium text-accent">{remainingFor(null)}</span></>}
        </div>
      </div>

      {savedMsg && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
          <CheckCircle2 size={16} /> 保存が完了しました。
        </div>
      )}

      {/* 列ヘッダー */}
      <div className="mb-2 grid grid-cols-[120px_1fr_70px_160px_70px_40px] gap-3 px-3 text-[11px] font-medium text-gray-500">
        <span>日付</span><span>メニュー</span><span>人数</span><span>利用状況 / 部位</span><span className="text-right">残数</span><span></span>
      </div>

      <div className="space-y-3">
        {sessions.map((s) => (
          <SessionCard key={s.id} session={s} member={member} trainers={trainers} presets={presets}
            remaining={remainingFor(s)} onSave={(p) => save(p, s.id)} onDelete={() => remove(s.id)} />
        ))}

        {draft && (
          <SessionCard session={null} member={member} trainers={trainers} presets={presets}
            remaining={remainingFor(null)} startOpen
            onSave={(p) => save(p)} onDelete={() => setDraft(false)} />
        )}
      </div>

      {monthlyLimitReached && !draft && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle size={16} />
          {`${planName}の今月の利用上限（${monthlyLimit}回）に達しています。来月まで新規カルテは登録できません。`}
        </div>
      )}

      {ticketEmpty && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-accent-gold/50 bg-accent-gold/10 px-4 py-3 text-sm text-accent-gold">
          <AlertTriangle size={16} />
          回数券の残数が0です。セッションの入力はできますが、保存時に回数券の購入が必要です（購入後に自動で保存されます）。
        </div>
      )}

      <button onClick={() => setDraft(true)} disabled={draft || monthlyLimitReached}
        title={monthlyLimitReached ? '利用回数の上限に達しています' : ''}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-navy-600 py-3 text-sm text-gray-400 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-navy-600 disabled:hover:text-gray-400">
        <Plus size={16} /> 新規カルテを追加
      </button>
    </div>
  )
}

function SessionCard({ session, member, trainers, presets, remaining, onSave, onDelete, startOpen }) {
  const today = new Date().toISOString().slice(0, 10)
  const planType = member?.plan_type || 'ticket'
  const [open, setOpen] = useState(!!startOpen)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState(() => ({
    session_date: (session?.session_date || today).slice(0, 10),
    participant_count: session?.participant_count || 1,
    trainer_name: session?.trainer_name || '',
    usage_status: session?.usage_status || usageLabel(member),
    consume_ticket: session ? session.ticket_id != null : planType === 'ticket'
  }))
  const [muscles, setMuscles] = useState(() => {
    const m = session?.muscles || []
    return [m[0] || '', m[1] || '']
  })
  // メニューは種目ごとに「セットの配列」を持つ。各セットは { weight_kg, reps }。
  const [rows, setRows] = useState(() =>
    (session?.exercises || []).map((e) => ({
      exercise_name: e.exercise_name || '',
      sets: Array.isArray(e.sets) && e.sets.length
        ? e.sets.map((st) => ({ weight_kg: st.weight_kg ?? '', reps: st.reps ?? '' }))
        : [{ weight_kg: e.weight_kg ?? '', reps: e.reps ?? '' }]
    }))
  )
  // 日次カルテは自由記述テキストのみ（member_commentに保存）
  const [dailyText, setDailyText] = useState(() => session?.daily?.member_comment ?? '')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setMuscle = (i, v) => setMuscles((arr) => arr.map((x, idx) => (idx === i ? v : x)))

  // 種目名の変更
  const setExName = (i, v) => setRows((arr) => arr.map((r, idx) => (idx === i ? { ...r, exercise_name: v } : r)))
  // セット内の値（重量・回数）の変更
  const setSet = (i, j, k, v) => setRows((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, sets: r.sets.map((st, sj) => (sj === j ? { ...st, [k]: v } : st)) } : r))
  // セット追加（直前セットの重量を引き継ぐと入力が楽）
  const addSet = (i) => setRows((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, sets: [...r.sets, { weight_kg: r.sets[r.sets.length - 1]?.weight_kg ?? '', reps: '' }] } : r))
  const removeSet = (i, j) => setRows((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, sets: r.sets.length > 1 ? r.sets.filter((_, sj) => sj !== j) : r.sets } : r))
  const addRow = (name = '') => setRows((arr) => [...arr, { exercise_name: name, sets: [{ weight_kg: '', reps: '' }] }])
  const removeRow = (i) => setRows((arr) => arr.filter((_, idx) => idx !== i))

  // 種目名が入っている行だけ有効
  const validRows = useMemo(() => rows.filter((r) => String(r.exercise_name || '').trim()), [rows])
  // 折りたたみ表示用に「ベンチプレス 60kg×10回, 60kg×8回」の形へ
  const menuLines = useMemo(() => validRows.map(rowToLine), [validRows])

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      member_id: member.id,
      session_date: form.session_date,
      participant_count: Number(form.participant_count),
      trainer_name: form.trainer_name,
      usage_status: form.usage_status,
      consume_ticket: planType === 'ticket' && form.consume_ticket,
      muscles: muscles.filter(Boolean),
      exercises: validRows.map((r) => ({
        exercise_name: String(r.exercise_name).trim(),
        sets: r.sets.map((st) => ({ weight_kg: st.weight_kg, reps: st.reps }))
      })),
      daily: { member_comment: dailyText }
    }
    await onSave(payload)
    setSaving(false)
  }

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800">
      {/* 行サマリー */}
      <div className="grid grid-cols-[120px_1fr_70px_160px_70px_40px] items-start gap-3 px-3 py-3 text-sm">
        <input type="date" value={form.session_date} onChange={(e) => set('session_date', e.target.value)} className={inpSm} />
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 text-left hover:text-accent">
          {menuLines.length ? (
            <div className="divide-y divide-navy-700/60 overflow-hidden rounded-md border border-navy-700/60">
              {menuLines.map((line, i) => (
                <div key={i} className="truncate bg-navy-900/40 px-2 py-1 text-xs text-gray-200">{line}</div>
              ))}
            </div>
          ) : <span className="text-gray-500">メニュー未入力</span>}
        </button>
        <select value={form.participant_count} onChange={(e) => set('participant_count', Number(e.target.value))} className={inpSm}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}名</option>)}
        </select>
        <div className="flex flex-col gap-0.5">
          <span className="truncate text-xs text-accent">{form.usage_status || '—'}</span>
          <span className="truncate text-[11px] text-gray-400">{muscles.filter(Boolean).join(' / ') || '部位未設定'}</span>
        </div>
        <span className="text-right font-medium text-accent">{remaining}</span>
        <button onClick={() => setOpen((o) => !o)} className="flex justify-center text-gray-400 hover:text-gray-100">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-navy-700 p-4">
          <div className="grid grid-cols-4 gap-4">
            <L label="担当トレーナー">
              <select value={form.trainer_name} onChange={(e) => set('trainer_name', e.target.value)} className={inp}>
                <option value="">未選択</option>
                {trainers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </L>
            <L label="利用状況">
              <input value={form.usage_status} onChange={(e) => set('usage_status', e.target.value)} className={inp} />
            </L>
            <L label="部位①">
              <select value={muscles[0]} onChange={(e) => setMuscle(0, e.target.value)} className={inp}>
                <option value="">未選択</option>
                {MUSCLE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </L>
            <L label="部位②">
              <select value={muscles[1]} onChange={(e) => setMuscle(1, e.target.value)} className={inp}>
                <option value="">未選択</option>
                {MUSCLE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </L>
          </div>

          {planType === 'ticket' && (
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-navy-600 bg-navy-900 px-4 py-3 text-base font-medium text-gray-100 hover:border-accent">
              <input type="checkbox" checked={form.consume_ticket} onChange={(e) => set('consume_ticket', e.target.checked)} className="h-5 w-5 accent-accent" />
              回数券を1回消費する
            </label>
          )}

          {/* メニュー（種目・重量・回数をプリセット選択／セットごとに回数を記録） */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs text-gray-400">トレーニングメニュー</p>
              <span className="text-[11px] text-gray-500">重量・回数を選択（セットごとに記録／前月比・記録表に自動反映）</span>
              <select value="" onChange={(e) => { if (e.target.value) addRow(e.target.value); e.target.value = '' }} className={`${inp} ml-auto w-56`}>
                <option value="">＋ プリセット種目から追加</option>
                {presets.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-lg border border-navy-700 bg-navy-900 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <select value={presets.some((p) => p.name === r.exercise_name) ? r.exercise_name : (r.exercise_name ? '__custom__' : '')}
                      onChange={(e) => { if (e.target.value !== '__custom__') setExName(i, e.target.value) }} className={`${inpSm} flex-1`}>
                      <option value="">種目を選択</option>
                      {presets.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                      {r.exercise_name && !presets.some((p) => p.name === r.exercise_name) && (
                        <option value="__custom__">{r.exercise_name}（旧データ）</option>
                      )}
                    </select>
                    <button onClick={() => removeRow(i)} className="shrink-0 text-gray-400 hover:text-red-400" title="この種目を削除">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {r.sets.map((st, j) => (
                      <div key={j} className="grid grid-cols-[52px_1fr_1fr_28px] items-center gap-2">
                        <span className="text-[11px] text-gray-400">{j + 1}セット</span>
                        <select value={st.weight_kg === '' || st.weight_kg == null ? '' : String(st.weight_kg)}
                          onChange={(e) => setSet(i, j, 'weight_kg', e.target.value)} className={inpSm}>
                          <option value="">重量 ―</option>
                          {weightOptionsFor(st.weight_kg).map((w) => <option key={w} value={w}>{w}kg</option>)}
                        </select>
                        <select value={st.reps === '' || st.reps == null ? '' : String(st.reps)}
                          onChange={(e) => setSet(i, j, 'reps', e.target.value)} className={inpSm}>
                          <option value="">回数 ―</option>
                          {REP_OPTIONS.map((n) => <option key={n} value={n}>{n}回</option>)}
                        </select>
                        <button onClick={() => removeSet(i, j)} disabled={r.sets.length <= 1}
                          className="flex justify-center text-gray-400 hover:text-red-400 disabled:opacity-30" title="このセットを削除">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => addSet(i)} className="mt-2 flex items-center gap-1 text-[11px] text-accent hover:underline">
                    <Plus size={12} /> セットを追加
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => addRow()} className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-navy-600 px-3 py-1.5 text-xs text-gray-400 hover:border-accent hover:text-accent">
              <Plus size={13} /> 種目を追加
            </button>
          </div>

          {/* 日次カルテ（自由記述テキストのみ） */}
          <div className="mt-4 rounded-lg border border-navy-700 bg-navy-900 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-gray-300"><Dumbbell size={13} className="text-gray-500" /> 日次カルテ</p>
            <textarea
              rows={3}
              value={dailyText}
              onChange={(e) => setDailyText(e.target.value)}
              placeholder="体重・体調・食事・睡眠・コメントなどを自由に記録"
              className={`${inp} leading-relaxed`}
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onDelete} className="flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10">
              <Trash2 size={15} /> {session ? '削除' : 'キャンセル'}
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              <Save size={15} /> {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const inp = 'w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm outline-none focus:border-accent'
const inpSm = 'w-full rounded-lg border border-navy-600 bg-navy-900 px-2 py-1.5 text-xs outline-none focus:border-accent'

// 重量プリセット: 0kg〜80kg を 0.5kg刻み
const WEIGHT_OPTIONS = Array.from({ length: 161 }, (_, i) => i * 0.5)
const REP_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1)

// 旧データなどでプリセット外の重量を持つ場合、その値も選択肢に含める
function weightOptionsFor(cur) {
  const n = cur === '' || cur == null ? null : Number(cur)
  if (n == null || Number.isNaN(n) || WEIGHT_OPTIONS.includes(n)) return WEIGHT_OPTIONS
  return [...WEIGHT_OPTIONS, n].sort((a, b) => a - b)
}

// 種目（セット配列）を「ベンチプレス 60kg×10回, 60kg×8回」の形に整形
function rowToLine(r) {
  const name = String(r.exercise_name).trim()
  const segs = (r.sets || []).map((st) => {
    const p = []
    if (st.weight_kg !== '' && st.weight_kg != null) p.push(`${st.weight_kg}kg`)
    if (st.reps !== '' && st.reps != null) p.push(`${st.reps}回`)
    return p.join('×')
  }).filter(Boolean)
  return name + (segs.length ? ` ${segs.join(', ')}` : '')
}

function L({ label, full, children }) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="mb-1 block text-xs text-gray-400">{label}</span>
      {children}
    </label>
  )
}
