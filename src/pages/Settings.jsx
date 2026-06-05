import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, Download, Upload, FileSpreadsheet, Dumbbell, RefreshCw } from 'lucide-react'
import ExcelImport from '../components/ExcelImport'

export default function Settings() {
  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold">設定</h1>
      <div className="max-w-3xl space-y-6">
        <GymSection />
        <TrainerSection />
        <PresetSection />
        <DataSection />
        <UpdateSection />
      </div>
    </div>
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
  const load = () => window.api.presets.list().then(setList)
  useEffect(() => { load() }, [])

  const add = async () => { if (!form.name.trim()) return; await window.api.presets.create(form); setForm({ name: '', category: '' }); load() }
  const upd = async (p, k, v) => { await window.api.presets.update({ ...p, [k]: v }); load() }
  const remove = async (id) => { if (confirm('この種目を削除しますか？')) { await window.api.presets.remove(id); load() } }

  return (
    <Section title="種目プリセット" icon={Dumbbell}>
      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <input defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && upd(p, 'name', e.target.value)} className={`${inp} flex-1`} />
            <input defaultValue={p.category || ''} onBlur={(e) => (e.target.value !== (p.category || '')) && upd(p, 'category', e.target.value)} placeholder="部位カテゴリ" className={`${inp} w-32`} />
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
        case 'available': setStatus(`新しいバージョン ${info?.version || ''} が見つかりました`); break
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
