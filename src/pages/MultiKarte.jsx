import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Save, ExternalLink, AlertTriangle, Copy, GripVertical, Check, Plus, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ALL_MUSCLES } from '../components/BodyMap'
import { PurchaseModal } from '../components/TicketsTab'
import { fmtDate } from '../lib/format'
import {
  REP_OPTIONS, SECONDS_OPTIONS, isHiitName, makeNormalRow, makeHiitRow,
  weightOptionsFor, rowsToExercises, parseManualLine
} from '../lib/exerciseRows'

const today = () => new Date().toISOString().slice(0, 10)

// rows（構造化メニュー）をディープコピー（コピー機能で共有参照にしないため）
const cloneRows = (rows) => (rows || []).map((r) => ({
  ...r,
  sets: (r.sets || []).map((s) => ({ ...s })),
  children: (r.children || []).map((c) => ({ ...c }))
}))

// 各カードの入力初期状態
const blankEntry = () => ({
  // セッション
  muscles: [], consume_ticket: true,
  menuText: '',
  // 構造化メニュー（重量・回数・秒数・HIIT子種目）。シングル展開と同形式。
  rows: [],
  // 日次カルテ（自由記述テキスト）
  member_comment: ''
})

export default function MultiKarte() {
  const ids = useStore((s) => s.multiIds)
  const navigate = useStore((s) => s.navigate)
  const openMember = useStore((s) => s.openMember)

  const [cards, setCards] = useState([])           // 並び順を保持する会員配列
  const [entries, setEntries] = useState({})       // memberId -> 入力state
  const [presets, setPresets] = useState([])
  const [trainer, setTrainer] = useState('')
  const [trainers, setTrainers] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedIds, setSavedIds] = useState([])
  const [dragId, setDragId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([]) // 選択保存・選択コピーの対象
  const [selectBanner, setSelectBanner] = useState(false) // 選択保存完了の固定バナー
  const [purchaseQueue, setPurchaseQueue] = useState([]) // 回数券残0で購入待ちの会員（同一ページ上のモーダルで順次購入）

  useEffect(() => {
    window.api.members.cards(ids).then((rows) => {
      setCards(rows)
      const init = {}
      rows.forEach((m) => { init[m.id] = blankEntry() })
      setEntries(init)
    })
    window.api.presets.list().then(setPresets)
    window.api.trainers.list().then(setTrainers)
  }, [ids])

  const cols = cards.length >= 5 ? 2 : Math.min(Math.max(cards.length, 1), 4)
  const upd = (id, patch) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...patch } }))

  const toggleSelect = (id) => setSelectedIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])

  // 1枚のカードのメニュー（自由記述＋構造化行）を指定の会員へコピー
  const copyMenuTo = (srcId, targetIds) => {
    const srcText = entries[srcId]?.menuText || ''
    const srcRows = entries[srcId]?.rows || []
    setEntries((e) => {
      const next = { ...e }
      targetIds.forEach((id) => {
        if (id === srcId) return
        next[id] = { ...next[id], menuText: srcText, rows: cloneRows(srcRows) }
      })
      return next
    })
  }
  // 全員にコピー
  const copyMenuToAll = (srcId) => copyMenuTo(srcId, cards.map((m) => m.id))
  // 選択中の会員にコピー
  const copyMenuToSelected = (srcId) => copyMenuTo(srcId, selectedIds)

  // D&D並べ替え
  const onDrop = (targetId) => {
    if (dragId == null || dragId === targetId) return
    setCards((arr) => {
      const from = arr.findIndex((m) => m.id === dragId)
      const to = arr.findIndex((m) => m.id === targetId)
      const copy = [...arr]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved)
      return copy
    })
    setDragId(null)
  }

  // 残回数の再取得（保存・購入後に各カードへ反映）
  const refreshRemaining = () => {
    window.api.members.cards(cards.map((m) => m.id)).then((rows) => {
      const map = Object.fromEntries(rows.map((r) => [r.id, r]))
      setCards((arr) => arr.map((m) => ({ ...m, remaining_count: map[m.id]?.remaining_count ?? m.remaining_count })))
    })
  }

  // 1会員分のセッションpayloadを構築（入力が無ければnull）
  // 構造化行（重量・回数・秒数・HIIT）＋自由記述メニュー（行ごとに種目名のみ）の両方を保存。
  const buildSession = (m) => {
    const e = entries[m.id]
    const menuLines = (e.menuText || '').split('\n').map((l) => l.trim()).filter(Boolean)
    // 規則的な書式（種目名 [重量kg] 回数/秒数s）の行は構造化して保存→記録表に反映。
    // 書式外の行は従来どおり種目名のみで保存（記録表には反映されない）。
    const freeExercises = menuLines.map((line) => parseManualLine(line) || { exercise_name: line })
    const structured = rowsToExercises(e.rows)
    const exercises = [...structured, ...freeExercises]
    const consume = m.plan_type === 'ticket' && e.consume_ticket
    const hasSession = e.muscles.length || exercises.length || consume
    if (!hasSession) return null
    return {
      member_id: m.id, session_date: today(), participant_count: cards.length,
      trainer_name: trainer || null, consume_ticket: consume,
      muscles: e.muscles, exercises
    }
  }

  // 指定した会員のうち、入力のある人だけ保存する共通処理
  // 回数券残0の会員はセッションを保留し、購入待ちキューへ（日次カルテは先に保存）
  const saveCards = async (targetCards) => {
    setSaving(true)
    const saved = []
    const needPurchase = []
    for (const m of targetCards) {
      const e = entries[m.id]
      const session = buildSession(m)
      const hasDaily = e.member_comment.trim()
      const blocked = session && m.plan_type === 'ticket' && (m.remaining_count ?? 0) <= 0
      if (session && !blocked) {
        await window.api.sessions.create(session)
      }
      if (hasDaily) {
        await window.api.daily.save({ member_id: m.id, log_date: today(), member_comment: e.member_comment })
      }
      if ((session && !blocked) || hasDaily) saved.push(m.id)
      if (blocked) needPurchase.push(m)
    }
    setSaving(false)
    setSavedIds(saved)
    refreshRemaining()
    if (needPurchase.length) {
      alert(`次の会員は回数券が残0です：\n${needPurchase.map((m) => '・' + m.name).join('\n')}\n\n購入画面を順番に表示します。購入が完了すると、その会員のセッションが保存されます。`)
      setPurchaseQueue(needPurchase)
    }
    return { saved, needPurchase }
  }

  // 購入完了 → 先頭会員の保留セッションを保存し、次の会員へ（モーダルは同一ページ上なのでカードは閉じない）
  const handlePurchaseSaved = async () => {
    const m = purchaseQueue[0]
    if (m) {
      const session = buildSession(m)
      if (session) await window.api.sessions.create(session)
      setSavedIds((s) => (s.includes(m.id) ? s : [...s, m.id]))
      refreshRemaining()
    }
    setPurchaseQueue((q) => q.slice(1))
  }
  // 購入をスキップ（この会員のセッションは保存せず次へ）
  const handlePurchaseSkip = () => setPurchaseQueue((q) => q.slice(1))

  // 全員を対象に保存
  const saveAll = () => saveCards(cards)
  // 選択中の会員のみ保存（購入待ちが無ければ右上に固定バナーを3秒表示）
  const saveSelected = async () => {
    const res = await saveCards(cards.filter((m) => selectedIds.includes(m.id)))
    if (res.needPurchase.length === 0) {
      setSelectBanner(true)
      setTimeout(() => setSelectBanner(false), 3000)
    }
  }

  if (cards.length === 0) return <div className="p-8 text-gray-400">読み込み中…</div>

  return (
    <div className="flex h-full flex-col">
      {/* 選択保存完了の固定バナー（スクロールしても右上に固定） */}
      {selectBanner && (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-2 rounded-lg border border-green-500/50 bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
          <Check size={18} /> 選択顧客のカルテを保存しました。
        </div>
      )}

      {/* 回数券残0の会員を同一ページ上で順次購入（カードは閉じない） */}
      {purchaseQueue.length > 0 && (
        <PurchaseModal
          key={purchaseQueue[0].id}
          memberId={purchaseQueue[0].id}
          memberName={purchaseQueue[0].name}
          onClose={handlePurchaseSkip}
          onSaved={handlePurchaseSaved}
        />
      )}
      <div className="flex items-center justify-between border-b border-navy-700 bg-navy-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('members')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-100">
            <ArrowLeft size={16} /> 会員一覧
          </button>
          <h1 className="text-lg font-bold">マルチカルテ <span className="text-sm font-normal text-gray-400">{cards.length}名 同時記録</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={trainer} onChange={(e) => setTrainer(e.target.value)} className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="">担当トレーナー（全員共通）</option>
            {trainers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          {selectedIds.length > 0 && (
            <button onClick={saveSelected} disabled={saving}
              className="flex items-center gap-2 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50">
              <Save size={16} /> {saving ? '保存中…' : `選択保存（${selectedIds.length}名）`}
            </button>
          )}
          <button onClick={saveAll} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            <Save size={16} /> {saving ? '保存中…' : '一括保存'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cards.map((m) => (
            <Card key={m.id} member={m} entry={entries[m.id]} presets={presets}
              saved={savedIds.includes(m.id)}
              selected={selectedIds.includes(m.id)}
              selectedCount={selectedIds.length}
              onToggleSelect={() => toggleSelect(m.id)}
              onUpd={(p) => upd(m.id, p)}
              onOpenFull={() => openMember(m.id)}
              onCopyAll={() => copyMenuToAll(m.id)}
              onCopySelected={() => copyMenuToSelected(m.id)}
              onDragStart={() => setDragId(m.id)}
              onDropCard={() => onDrop(m.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Card({ member: m, entry: e, presets, saved, selected, selectedCount, onToggleSelect, onUpd, onOpenFull, onCopyAll, onCopySelected, onDragStart, onDropCard }) {
  const low = m.remaining_count <= 3
  const toggleMuscle = (n) => onUpd({ muscles: e.muscles.includes(n) ? e.muscles.filter((x) => x !== n) : [...e.muscles, n] })
  // プリセット種目をメニュー末尾に1行追加
  const addPreset = (name) => {
    if (!name) return
    const t = e.menuText || ''
    onUpd({ menuText: t.trim() ? `${t.replace(/\n+$/, '')}\n${name}` : name })
  }
  const lastMenu = m.last_menu || []
  const recent = m.recent || []

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(ev) => ev.preventDefault()}
      onDrop={onDropCard}
      className={`flex flex-col rounded-xl border bg-navy-800 ${selected ? 'border-accent ring-1 ring-accent/40' : low ? 'border-red-500/60' : 'border-navy-700'}`}
    >
      {/* ヘッダー（常時表示） */}
      <div className="flex items-start justify-between gap-2 border-b border-navy-700 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={selected} onChange={onToggleSelect} title="選択保存・選択コピーの対象にする"
              className="h-4 w-4 shrink-0 accent-accent" onClick={(ev) => ev.stopPropagation()} />
            <GripVertical size={14} className="shrink-0 cursor-grab text-gray-600" />
            <span className="truncate font-bold">{m.name}</span>
            {saved && <Check size={14} className="shrink-0 text-green-400" />}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
            <span className={low ? 'flex items-center gap-0.5 font-semibold text-red-400' : ''}>
              {low && <AlertTriangle size={11} />}残{m.remaining_count}回
            </span>
            <span>前回 {fmtDate(m.last_visit)}</span>
          </div>
        </div>
        <button onClick={onOpenFull} title="フルカルテを開く" className="shrink-0 text-gray-400 hover:text-accent">
          <ExternalLink size={15} />
        </button>
      </div>

      {/* 前回メモ */}
      {m.last_next_memo && (
        <div className="border-b border-navy-700 bg-navy-900/40 px-4 py-2 text-[11px] text-gray-400">
          <span className="text-gray-500">前回メモ: </span>{m.last_next_memo}
        </div>
      )}

      <div className="flex-1 space-y-3 p-4 text-xs">
        {/* 鍛えた部位（チップ） */}
        <div>
          <p className="mb-1 text-gray-400">鍛えた部位</p>
          <div className="flex flex-wrap gap-1">
            {ALL_MUSCLES.map((mu) => {
              const on = e.muscles.includes(mu)
              return (
                <button key={mu} onClick={() => toggleMuscle(mu)}
                  className={`rounded-full px-2 py-0.5 text-[10px] transition ${on ? 'bg-accent text-white' : 'bg-navy-600 text-gray-300 hover:bg-navy-700'}`}>
                  {mu}
                </button>
              )
            })}
          </div>
        </div>

        {/* 直近3セッション（部位・メニュー簡易表示） */}
        {recent.length > 0 && (
          <div className="rounded border border-navy-700 bg-navy-900/40 p-2">
            <span className="mb-1 block text-[10px] text-gray-500">直近3セッション</span>
            <div className="space-y-1.5">
              {recent.map((r, i) => (
                <div key={i} className="border-t border-navy-700/60 pt-1 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-gray-400">{fmtDate(r.date)}</span>
                    <span className="truncate text-[10px] text-accent">{(r.muscles || []).join(' / ') || '部位なし'}</span>
                  </div>
                  {(r.menu || []).length > 0 && (
                    <div className="mt-0.5 truncate text-[10px] text-gray-400">{(r.menu || []).join('、')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 前回のメニュー */}
        {lastMenu.length > 0 && (
          <div className="rounded border border-navy-700 bg-navy-900/40 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] text-gray-500">前回のメニュー</span>
              <button onClick={() => onUpd({ menuText: lastMenu.join('\n') })} className="text-[10px] text-accent hover:underline">今回へコピー</button>
            </div>
            <div className="space-y-0.5">
              {lastMenu.map((line, i) => <div key={i} className="truncate text-[10px] text-gray-400">・{line}</div>)}
            </div>
          </div>
        )}

        {/* メニュー（プリセット選択 + 自由記述） */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-1">
            <span className="text-gray-400">手動入力欄</span>
            <div className="flex items-center gap-2">
              <select value="" onChange={(ev) => { addPreset(ev.target.value); ev.target.value = '' }} className={`${cinp} w-28`}>
                <option value="">＋種目</option>
                {presets.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              {selectedCount > 0 && (
                <button onClick={onCopySelected} title="選択中の会員にコピー" className="flex items-center gap-0.5 whitespace-nowrap text-[10px] text-accent hover:underline"><Copy size={11} /> 選択へ</button>
              )}
              <button onClick={onCopyAll} title="全員にコピー" className="flex items-center gap-0.5 whitespace-nowrap text-[10px] text-accent-gold hover:underline"><Copy size={11} /> 全員へ</button>
            </div>
          </div>
          <textarea rows={3} value={e.menuText} onChange={(ev) => onUpd({ menuText: ev.target.value })}
            placeholder={'1行1種目。記録表に反映する場合は「種目名 [重量kg] 回数/秒数s」\n例）ベンチプレス 60kg 10／プランク 30s'}
            className={`${cinp} font-mono leading-relaxed`} />
        </div>

        {/* 構造化メニュー（重量・回数・秒数・HIIT子種目）— 前月比・記録表に自動反映 */}
        <MenuRows rows={e.rows} presets={presets} onChange={(rows) => onUpd({ rows })} />

        <label className="block">
          <span className="mb-1 block text-gray-400">日次カルテ</span>
          <textarea rows={3} value={e.member_comment} onChange={(ev) => onUpd({ member_comment: ev.target.value })} placeholder="体重・体調・食事などを自由に記録" className={cinp} />
        </label>

        {m.plan_type === 'ticket' && (
          <label className="flex items-center gap-2 text-gray-300">
            <input type="checkbox" checked={e.consume_ticket} onChange={(ev) => onUpd({ consume_ticket: ev.target.checked })} className="accent-accent" />
            回数券を1回消費
          </label>
        )}
      </div>
    </div>
  )
}

// マルチカルテ用のコンパクトな構造化メニュー入力（シングル展開と同形式・同保存）。
function MenuRows({ rows, presets, onChange }) {
  const upd = (fn) => onChange(fn(rows || []))
  const addRow = (name = '') => upd((arr) => [...arr, isHiitName(name) ? makeHiitRow() : makeNormalRow(name)])
  const removeRow = (i) => upd((arr) => arr.filter((_, idx) => idx !== i))
  const changeExercise = (i, v) => upd((arr) => arr.map((r, idx) => {
    if (idx !== i) return r
    if (isHiitName(v)) return r.isHiit ? r : makeHiitRow()
    return r.isHiit ? makeNormalRow(v) : { ...r, exercise_name: v }
  }))
  const setMetric = (i, metric) => upd((arr) => arr.map((r, idx) => (idx === i ? { ...r, metric } : r)))
  const setSet = (i, j, k, v) => upd((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, sets: r.sets.map((st, sj) => (sj === j ? { ...st, [k]: v } : st)) } : r))
  const addSet = (i) => upd((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, sets: [...r.sets, { weight_kg: r.sets[r.sets.length - 1]?.weight_kg ?? '', reps: '', seconds: '' }] } : r))
  const removeSet = (i, j) => upd((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, sets: r.sets.length > 1 ? r.sets.filter((_, sj) => sj !== j) : r.sets } : r))
  const setChild = (i, j, k, v) => upd((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, children: r.children.map((c, cj) => (cj === j ? { ...c, [k]: v } : c)) } : r))
  const addChild = (i) => upd((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, children: [...r.children, { child_name: '', weight_kg: '', seconds: '' }] } : r))
  const removeChild = (i, j) => upd((arr) => arr.map((r, idx) =>
    idx === i ? { ...r, children: r.children.length > 1 ? r.children.filter((_, cj) => cj !== j) : r.children } : r))

  const list = rows || []
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-gray-400">重量・回数で記録</span>
        <select value="" onChange={(ev) => { if (ev.target.value) addRow(ev.target.value); ev.target.value = '' }} className={`${cinp} w-28`}>
          <option value="">＋種目</option>
          {presets.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      {list.length > 0 && (
        <div className="space-y-1.5">
          {list.map((r, i) => (
            <div key={i} className="rounded border border-navy-700 bg-navy-900/40 p-1.5">
              <div className="mb-1 flex items-center gap-1">
                <select
                  value={r.isHiit ? 'HIIT' : (presets.some((p) => p.name === r.exercise_name) ? r.exercise_name : (r.exercise_name ? '__custom__' : ''))}
                  onChange={(ev) => { if (ev.target.value !== '__custom__') changeExercise(i, ev.target.value) }}
                  className={`${cinp} flex-1`}>
                  <option value="">種目を選択</option>
                  {presets.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  {!r.isHiit && r.exercise_name && !presets.some((p) => p.name === r.exercise_name) && (
                    <option value="__custom__">{r.exercise_name}（旧データ）</option>
                  )}
                </select>
                {!r.isHiit && (
                  <div className="flex shrink-0 overflow-hidden rounded border border-navy-600 text-[10px]">
                    {[['reps', '回'], ['seconds', '秒']].map(([mk, ml]) => (
                      <button key={mk} type="button" onClick={() => setMetric(i, mk)}
                        className={`px-1.5 py-0.5 ${r.metric === mk ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                        {ml}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => removeRow(i)} className="shrink-0 text-gray-400 hover:text-red-400" title="この種目を削除">
                  <X size={13} />
                </button>
              </div>

              {r.isHiit ? (
                <div>
                  {r.children.map((c, j) => (
                    <div key={j} className="mb-1 grid grid-cols-[1fr_64px_64px_20px] items-center gap-1">
                      <select value={presets.some((p) => p.name === c.child_name) ? c.child_name : (c.child_name ? '__custom__' : '')}
                        onChange={(ev) => { if (ev.target.value !== '__custom__') setChild(i, j, 'child_name', ev.target.value) }} className={cinp}>
                        <option value="">子種目</option>
                        {presets.filter((p) => !isHiitName(p.name)).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        {c.child_name && !presets.some((p) => p.name === c.child_name) && <option value="__custom__">{c.child_name}</option>}
                      </select>
                      <select value={c.weight_kg === '' || c.weight_kg == null ? '' : String(c.weight_kg)}
                        onChange={(ev) => setChild(i, j, 'weight_kg', ev.target.value)} className={cinp}>
                        <option value="">kg</option>
                        {weightOptionsFor(c.weight_kg).map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                      <select value={c.seconds === '' || c.seconds == null ? '' : String(c.seconds)}
                        onChange={(ev) => setChild(i, j, 'seconds', ev.target.value)} className={cinp}>
                        <option value="">秒</option>
                        {SECONDS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={() => removeChild(i, j)} disabled={r.children.length <= 1}
                        className="flex justify-center text-gray-400 hover:text-red-400 disabled:opacity-30" title="削除"><X size={12} /></button>
                    </div>
                  ))}
                  <button onClick={() => addChild(i)} className="flex items-center gap-0.5 text-[10px] text-accent hover:underline"><Plus size={11} /> 子種目</button>
                </div>
              ) : (
                <div>
                  {r.sets.map((st, j) => (
                    <div key={j} className="mb-1 grid grid-cols-[34px_1fr_1fr_20px] items-center gap-1">
                      <span className="text-[10px] text-gray-400">{j + 1}set</span>
                      <select value={st.weight_kg === '' || st.weight_kg == null ? '' : String(st.weight_kg)}
                        onChange={(ev) => setSet(i, j, 'weight_kg', ev.target.value)} className={cinp}>
                        <option value="">kg</option>
                        {weightOptionsFor(st.weight_kg).map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                      {r.metric === 'seconds' ? (
                        <select value={st.seconds === '' || st.seconds == null ? '' : String(st.seconds)}
                          onChange={(ev) => setSet(i, j, 'seconds', ev.target.value)} className={cinp}>
                          <option value="">秒</option>
                          {SECONDS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <select value={st.reps === '' || st.reps == null ? '' : String(st.reps)}
                          onChange={(ev) => setSet(i, j, 'reps', ev.target.value)} className={cinp}>
                          <option value="">回</option>
                          {REP_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      )}
                      <button onClick={() => removeSet(i, j)} disabled={r.sets.length <= 1}
                        className="flex justify-center text-gray-400 hover:text-red-400 disabled:opacity-30" title="削除"><X size={12} /></button>
                    </div>
                  ))}
                  <button onClick={() => addSet(i)} className="flex items-center gap-0.5 text-[10px] text-accent hover:underline"><Plus size={11} /> セット</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const cinp = 'w-full rounded border border-navy-600 bg-navy-900 px-2 py-1 text-xs outline-none focus:border-accent'
