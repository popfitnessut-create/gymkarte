import { useState } from 'react'
import { FileSpreadsheet, ChevronRight, CheckCircle2, AlertTriangle, X } from 'lucide-react'

// アプリ側フィールド定義（ラベル・必須）
const FIELDS = [
  { key: 'name', label: '氏名', required: true },
  { key: 'furigana', label: 'フリガナ' },
  { key: 'birthdate', label: '生年月日' },
  { key: 'gender', label: '性別' },
  { key: 'phone', label: '電話番号' },
  { key: 'email', label: 'メールアドレス' },
  { key: 'joined_at', label: '入会日' },
  { key: 'status', label: 'ステータス' },
  { key: 'goal', label: '目標' },
  { key: 'health_notes', label: '健康状態・既往歴' },
  { key: 'notes', label: '備考' },
  { key: 'remaining_count', label: '回数券 残回数' },
  { key: 'expires_at', label: '回数券 有効期限' }
]

// Excelインポートウィザード：選択→マッピング→プレビュー→実行→ログ
export default function ExcelImport({ onClose, onDone }) {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)     // { columns, rows, preview, ... }
  const [mapping, setMapping] = useState({}) // fieldKey -> excel column
  const [log, setLog] = useState(null)
  const [busy, setBusy] = useState(false)

  const pick = async () => {
    setBusy(true)
    const res = await window.api.excel.open()
    setBusy(false)
    if (res.canceled) return
    if (!res.ok) { alert('読み込み失敗: ' + res.error); return }
    setFile(res)
    // 列名から自動マッピングを推定
    const auto = {}
    for (const f of FIELDS) {
      const hit = res.columns.find((c) => guessMatch(c, f))
      if (hit) auto[f.key] = hit
    }
    setMapping(auto)
    setStep(2)
  }

  const runImport = async () => {
    setBusy(true)
    const res = await window.api.excel.import({ rows: file.rows, mapping })
    setBusy(false)
    setLog(res)
    setStep(4)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-[820px] max-w-full overflow-y-auto rounded-xl border border-navy-600 bg-navy-800 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet size={20} className="text-accent-gold" /> Excel / CSV インポート</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100"><X size={18} /></button>
        </div>

        <Steps step={step} />

        {step === 1 && (
          <div className="rounded-xl border border-dashed border-navy-600 p-12 text-center">
            <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-500" />
            <p className="mb-4 text-sm text-gray-400">.xlsx / .xls / .csv ファイルを選択してください</p>
            <button onClick={pick} disabled={busy} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy ? '読み込み中…' : 'ファイルを選択'}
            </button>
          </div>
        )}

        {step === 2 && file && (
          <div>
            <p className="mb-3 text-sm text-gray-400">{file.fileName}（{file.total}行）の列を、アプリの項目に対応づけてください。</p>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 text-xs text-gray-300">{f.label}{f.required && <span className="text-red-400">*</span>}</span>
                  <select value={mapping[f.key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    className="flex-1 rounded-lg border border-navy-600 bg-navy-900 px-2 py-1.5 text-xs outline-none focus:border-accent">
                    <option value="">（対応なし）</option>
                    {file.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-between">
              <button onClick={() => setStep(1)} className="rounded-lg border border-navy-600 px-4 py-2 text-sm text-gray-300 hover:bg-navy-700">戻る</button>
              <button onClick={() => setStep(3)} disabled={!mapping.name}
                className="flex items-center gap-1 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                プレビュー <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && file && (
          <div>
            <p className="mb-3 text-sm text-gray-400">先頭10件のプレビュー（マッピング結果）</p>
            <div className="overflow-x-auto rounded-lg border border-navy-700">
              <table className="w-full text-xs">
                <thead className="bg-navy-900 text-gray-400">
                  <tr>{FIELDS.filter((f) => mapping[f.key]).map((f) => <th key={f.key} className="whitespace-nowrap px-3 py-2 text-left">{f.label}</th>)}</tr>
                </thead>
                <tbody>
                  {file.preview.map((row, i) => (
                    <tr key={i} className="border-t border-navy-700">
                      {FIELDS.filter((f) => mapping[f.key]).map((f) => (
                        <td key={f.key} className="whitespace-nowrap px-3 py-1.5 text-gray-200">{String(row[mapping[f.key]] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-between">
              <button onClick={() => setStep(2)} className="rounded-lg border border-navy-600 px-4 py-2 text-sm text-gray-300 hover:bg-navy-700">戻る</button>
              <button onClick={runImport} disabled={busy} className="rounded-lg bg-accent-gold px-5 py-2 text-sm font-medium text-gray-900 hover:opacity-90 disabled:opacity-50">
                {busy ? 'インポート中…' : `インポート実行（${file.total}件）`}
              </button>
            </div>
          </div>
        )}

        {step === 4 && log && (
          <div>
            <div className="mb-4 flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-400">
                <CheckCircle2 size={16} /> 成功 {log.success}件
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400">
                <AlertTriangle size={16} /> スキップ {log.skipped}件
              </div>
            </div>
            {log.errors.length > 0 && (
              <div className="max-h-52 overflow-y-auto rounded-lg border border-navy-700 p-3 text-xs">
                <p className="mb-2 text-gray-400">スキップ・エラーの詳細</p>
                {log.errors.map((e, i) => (
                  <div key={i} className="border-b border-navy-700/60 py-1 text-gray-300">行{e.row}: <span className="text-red-400">{e.reason}</span></div>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={() => { onDone?.(); onClose() }} className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90">完了</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Steps({ step }) {
  const labels = ['ファイル選択', '列マッピング', 'プレビュー', '結果']
  return (
    <div className="mb-5 flex items-center gap-2 text-xs">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full ${step >= i + 1 ? 'bg-accent text-white' : 'bg-navy-700 text-gray-400'}`}>{i + 1}</span>
          <span className={step >= i + 1 ? 'text-gray-200' : 'text-gray-500'}>{l}</span>
          {i < labels.length - 1 && <ChevronRight size={14} className="text-gray-600" />}
        </div>
      ))}
    </div>
  )
}

// 列名からフィールドを推定
function guessMatch(col, field) {
  const c = col.toLowerCase().replace(/\s/g, '')
  const map = {
    name: ['氏名', '名前', 'name'], furigana: ['フリガナ', 'ふりがな', 'カナ', 'kana', 'furigana'],
    birthdate: ['生年月日', '誕生日', 'birth'], gender: ['性別', 'gender', 'sex'],
    phone: ['電話', 'tel', 'phone'], email: ['メール', 'mail', 'email'],
    joined_at: ['入会', 'join'], status: ['ステータス', '状態', 'status'],
    goal: ['目標', 'goal'], health_notes: ['健康', '既往', 'health'], notes: ['備考', 'メモ', 'note'],
    remaining_count: ['残回数', '残数', 'remaining'], expires_at: ['有効期限', '期限', 'expire']
  }
  return (map[field.key] || []).some((k) => c.includes(k.toLowerCase()))
}
