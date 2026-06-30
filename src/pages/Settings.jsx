import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, Download, Upload, FileSpreadsheet, Dumbbell, RefreshCw, Cloud, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react'
import ExcelImport from '../components/ExcelImport'

export default function Settings() {
  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold">設定</h1>
      <div className="max-w-3xl space-y-6">
        <GymSection />
        <CloudSyncSection />
        <TrainerSection />
        <PresetSection />
        <DataSection />
        <UpdateSection />
      </div>
    </div>
  )
}

// クラウド同期（店舗PCとMacでデータ共有）
function CloudSyncSection() {
  const [status, setStatus] = useState(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const loadStatus = () => window.api?.sync?.status().then((s) => {
    setStatus(s)
    if (s?.syncUrl) setUrl(s.syncUrl)
  }).catch(() => {})
  useEffect(() => { loadStatus() }, [])

  if (!window.api?.sync) return null

  const save = async () => {
    setBusy(true); setMsg('')
    const res = await window.api.sync.setConfig({ syncUrl: url, authToken: token })
    setBusy(false)
    if (res?.ok === false) setMsg('保存に失敗しました: ' + (res.error || ''))
    else if (!res?.restarted) { setMsg('保存しました。次回の再起動で反映されます。'); loadStatus() }
  }
  const syncNow = async () => {
    setBusy(true); setMsg('')
    const res = await window.api.sync.now()
    setBusy(false)
    setMsg(res?.ok ? '同期しました。' : '同期できませんでした' + (res?.error ? '：' + res.error : ''))
    loadStatus()
  }
  const disconnect = async () => {
    if (!confirm('クラウド同期を解除しますか？このPCはローカル保存に戻ります（データはクラウド側に残ります）。')) return
    setBusy(true)
    await window.api.sync.setConfig({ syncUrl: '', authToken: '' })
    setBusy(false)
  }

  const enabled = status?.enabled
  const canSync = status?.canSync !== false

  return (
    <Section title="クラウド同期（店舗PC ⇔ Mac でデータ共有）" icon={Cloud}>
      {!canSync && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          このバージョンは同期エンジン（libsql）を含んでいません。同期対応版のインストールが必要です。
        </div>
      )}

      <div className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm
        ${enabled ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-navy-600 bg-navy-900 text-gray-400'}`}>
        {enabled ? <CheckCircle2 size={16} /> : <Cloud size={16} />}
        {enabled
          ? `同期は有効です${status?.lastSyncAt ? `（最終同期 ${new Date(status.lastSyncAt).toLocaleTimeString()}）` : ''}`
          : '現在はローカル保存（このPC内のみ）です'}
        {enabled && status?.lastError && <span className="text-amber-300">／ 注意: {status.lastError}</span>}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">同期先URL（Tursoの Database URL：libsql://… で始まる）</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={`${inp} w-full`} placeholder="libsql://your-db-name.turso.io" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">認証トークン（Auth Token）</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" className={`${inp} w-full`} placeholder="ここにトークンを貼り付け（保存後は再表示されません）" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy || !canSync} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          <Save size={15} /> 保存して再起動
        </button>
        {enabled && (
          <button onClick={syncNow} disabled={busy} className="flex items-center gap-2 rounded-lg border border-navy-600 px-4 py-2 text-sm hover:bg-navy-700 disabled:opacity-50">
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> 今すぐ同期
          </button>
        )}
        {status?.configured && (
          <button onClick={disconnect} disabled={busy} className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50">
            同期を解除
          </button>
        )}
      </div>
      {msg && <p className="mt-3 break-all text-xs text-green-400">{msg}</p>}
      <p className="mt-3 text-xs text-gray-500">
        店舗PCとMacの両方に同じURL・トークンを設定すると、保存内容が自動で共有されます。書き込みのたびに自動同期し、数秒ごとに相手の変更も取り込みます。
      </p>
    </Section>
  )
}

function Section({ title, icon: Icon, children, action }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-gray-200">{Icon && <Icon size={16} className="text-accent" />} {title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

const inp = 'rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm outline-none focus:border-accent'

function GymSection() {
  const [gymName, setGymName] = useState('')
  const [logo, setLogo] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.get().then((s) => { setGymName(s.gym_name || ''); setLogo(s.logo_path || '') })
  }, [])

  const save = async () => {
    await window.api.settings.set('gym_name', gymName)
    await window.api.settings.set('logo_path', logo)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Section title="ジム情報">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">ジム名</span>
          <input value={gymName} onChange={(e) => setGymName(e.target.value)} className={`${inp} w-full`} placeholder="例：YourGym 渋谷店" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">ロゴ画像パス（任意）</span>
          <input value={logo} onChange={(e) => setLogo(e.target.value)} className={`${inp} w-full`} placeholder="assets/logo.png" />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"><Save size={15} /> 保存</button>
        {saved && <span className="text-xs text-green-400">保存しました</span>}
      </div>
    </Section>
  )
}

function TrainerSection() {
  const [list, setList] = useState([])
  const [name, setName] = useState('')
  const load = () => window.api.trainers.list().then(setList)
  useEffect(() => { load() }, [])

  const add = async () => { if (!name.trim()) return; await window.api.trainers.create(name.trim()); setName(''); load() }
  const rename = async (t, v) => { await window.api.trainers.update({ id: t.id, name: v, active: t.active }); load() }
  const remove = async (id) => { if (confirm('このトレーナーを削除しますか？')) { await window.api.trainers.remove(id); load() } }

  return (
    <Section title="トレーナー">
      <div className="space-y-2">
        {list.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <input defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && rename(t, e.target.value)} className={`${inp} flex-1`} />
            <button onClick={() => remove(t.id)} className="px-1 text-gray-500 hover:text-red-400"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="トレーナー名を追加" className={`${inp} flex-1`} />
        <button onClick={add} className="flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"><Plus size={15} /> 追加</button>
      </div>
    </Section>
  )
}

function PresetSection() {
  const [list, setList] = useState([])
  const [form, setForm] = useState({ name: '', category: '' })
  const [busy, setBusy] = useState(false)
  const load = () => window.api.presets.list().then(setList)
  useEffect(() => { load() }, [])

  const add = async () => { if (!form.name.trim()) return; await window.api.presets.create(form); setForm({ name: '', category: '' }); load() }
  const upd = async (p, k, v) => { await window.api.presets.update({ ...p, [k]: v }); load() }
  const remove = async (id) => { if (confirm('この種目を削除しますか？')) { await window.api.presets.remove(id); load() } }

  // 並び順を保存（id配列の順に sort_order を振り直す）
  const persistOrder = async (ordered) => {
    setList(ordered) // 楽観的に即反映
    setBusy(true)
    await window.api.presets.reorder(ordered.map((p) => p.id))
    setBusy(false)
    load()
  }
  // 手動入れ替え（1つ上／下へ）
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const next = list.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    persistOrder(next)
  }
  // 部位別（カテゴリ→名前）に並べ替え
  const sortByCategory = () => {
    const next = list.slice().sort((a, b) =>
      String(a.category || '').localeCompare(String(b.category || ''), 'ja') ||
      String(a.name || '').localeCompare(String(b.name || ''), 'ja'))
    persistOrder(next)
  }
  // 五十音（名前のかな順）に並べ替え
  const sortByKana = () => {
    const next = list.slice().sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'ja'))
    persistOrder(next)
  }

  return (
    <Section title="種目プリセット" icon={Dumbbell}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">並び替え：</span>
        <button onClick={sortByCategory} disabled={busy} className="rounded-lg border border-navy-600 px-3 py-1.5 text-xs text-gray-300 hover:border-accent hover:text-accent disabled:opacity-50">部位別</button>
        <button onClick={sortByKana} disabled={busy} className="rounded-lg border border-navy-600 px-3 py-1.5 text-xs text-gray-300 hover:border-accent hover:text-accent disabled:opacity-50">五十音順</button>
        <span className="text-[11px] text-gray-500">／ ↑↓で手動入れ替え（この並び順がメニュー選択にも反映されます）</span>
      </div>
      <div className="space-y-2">
        {list.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} disabled={i === 0 || busy} className="text-gray-500 hover:text-accent disabled:opacity-25" title="上へ"><ArrowUp size={13} /></button>
              <button onClick={() => move(i, 1)} disabled={i === list.length - 1 || busy} className="text-gray-500 hover:text-accent disabled:opacity-25" title="下へ"><ArrowDown size={13} /></button>
            </div>
            <input defaultValue={p.name} key={`n${p.id}-${p.sort_order}`} onBlur={(e) => e.target.value !== p.name && upd(p, 'name', e.target.value)} className={`${inp} flex-1`} />
            <input defaultValue={p.category || ''} key={`c${p.id}-${p.sort_order}`} onBlur={(e) => (e.target.value !== (p.category || '')) && upd(p, 'category', e.target.value)} placeholder="部位カテゴリ" className={`${inp} w-32`} />
            <button onClick={() => remove(p.id)} className="px-1 text-gray-500 hover:text-red-400"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="種目名" className={`${inp} flex-1`} />
        <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="カテゴリ" className={`${inp} w-32`} />
        <button onClick={add} className="flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"><Plus size={15} /> 追加</button>
      </div>
    </Section>
  )
}

function DataSection() {
  const [showImport, setShowImport] = useState(false)
  const [msg, setMsg] = useState('')

  const doExport = async () => {
    const res = await window.api.backup.export()
    if (res.canceled) return
    setMsg(res.ok ? `バックアップを保存しました: ${res.path}` : `失敗: ${res.error}`)
  }
  const doRestore = async () => {
    const res = await window.api.backup.import()
    if (res.canceled) return
    if (!res.ok) setMsg(`復元失敗: ${res.error}`)
  }

  return (
    <Section title="データ管理">
      <div className="flex flex-wrap gap-3">
        <button onClick={doExport} className="flex items-center gap-2 rounded-lg border border-navy-600 px-4 py-2.5 text-sm hover:bg-navy-700"><Download size={16} /> バックアップを書き出す</button>
        <button onClick={doRestore} className="flex items-center gap-2 rounded-lg border border-navy-600 px-4 py-2.5 text-sm hover:bg-navy-700"><Upload size={16} /> バックアップから復元</button>
        <button onClick={() => setShowImport(true)} className="flex items-center gap-2 rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-medium text-gray-900 hover:opacity-90"><FileSpreadsheet size={16} /> Excel / CSV インポート</button>
      </div>
      <p className="mt-3 text-xs text-gray-500">バックアップはSQLiteファイル（.db）として保存されます。復元するとアプリが再起動します。</p>
      {msg && <p className="mt-2 break-all text-xs text-green-400">{msg}</p>}
      {showImport && <ExcelImport onClose={() => setShowImport(false)} onDone={() => setMsg('インポートが完了しました。会員一覧をご確認ください。')} />}
    </Section>
  )
}

function UpdateSection() {
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!window.api?.updater) return
    window.api.updater.version().then(setVersion).catch(() => {})
    const off = window.api.updater.onStatus(({ status, info }) => {
      switch (status) {
        case 'checking': setStatus('確認中…'); break
        case 'available': setStatus(`新しいバージョン ${info?.version || ''} が配信されています。最新版へのバージョンアップを実行してください。`); break
        case 'not-available': setStatus('最新バージョンを使用中です'); setChecking(false); break
        case 'downloading': setStatus('ダウンロード中…'); break
        case 'progress': setStatus(`ダウンロード中… ${info?.percent ?? 0}%`); break
        case 'downloaded': setStatus('ダウンロード完了。再起動で更新できます'); setChecking(false); break
        case 'error': setStatus('確認に失敗しました'); setChecking(false); break
        default: break
      }
    })
    return off
  }, [])

  const check = async () => {
    if (!window.api?.updater) return
    setChecking(true); setStatus('確認中…')
    const res = await window.api.updater.check()
    if (res && res.ok === false) {
      setChecking(false)
      setStatus(res.reason === 'dev' ? '開発モードでは確認できません（インストール版で動作します）' : '現在は確認できません')
    }
  }

  return (
    <Section title="アプリのアップデート" icon={RefreshCw}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-200">現在のバージョン：<span className="font-medium">{version || '—'}</span></p>
          {status && <p className="mt-1 text-xs text-gray-400">{status}</p>}
        </div>
        <button onClick={check} disabled={checking} className="flex items-center gap-2 rounded-lg border border-navy-600 px-4 py-2.5 text-sm hover:bg-navy-700 disabled:opacity-50">
          <RefreshCw size={16} className={checking ? 'animate-spin' : ''} /> アップデートを確認
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-500">起動時にも自動でアップデートを確認します。新しいバージョンがある場合はダウンロードするか確認のうえ、再起動時に適用されます。</p>
    </Section>
  )
}
