import { LayoutDashboard, Users, Dumbbell, Settings, ClipboardList, BarChart3, BookOpen } from 'lucide-react'
import { useStore } from '../store/useStore'

const NAV = [
  { key: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { key: 'members', label: '会員一覧', icon: Users },
  { key: 'procedures', label: '手続き', icon: ClipboardList },
  { key: 'memberStats', label: '会員統計', icon: BarChart3 },
  { key: 'help', label: 'ヘルプ・マニュアル', icon: BookOpen }
]

export default function Sidebar() {
  const page = useStore((s) => s.page)
  const navigate = useStore((s) => s.navigate)
  const current = page === 'memberDetail' ? 'members' : page

  return (
    <aside className="flex w-60 flex-col border-r border-navy-700 bg-navy-800">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-navy-700">
        <Dumbbell className="text-accent" size={26} />
        <span className="text-xl font-bold tracking-wide">GymKarte</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => navigate(key)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition
              ${current === key
                ? 'bg-accent text-white'
                : 'text-gray-300 hover:bg-navy-700 hover:text-gray-100'}`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-navy-700">
        <button
          onClick={() => navigate('settings')}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition
            ${current === 'settings' ? 'bg-accent text-white' : 'text-gray-300 hover:bg-navy-700 hover:text-gray-100'}`}
        >
          <Settings size={18} />
          設定
        </button>
        <p className="mt-3 px-3 text-[11px] text-gray-500">GymKarte · v0.1.0</p>
      </div>
    </aside>
  )
}
