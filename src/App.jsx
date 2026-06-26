import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import MemberList from './pages/MemberList'
import MemberDetail from './pages/MemberDetail'
import MultiKarte from './pages/MultiKarte'
import Settings from './pages/Settings'
import Procedures from './pages/Procedures'
import MemberStats from './pages/MemberStats'
import Help from './pages/Help'

export default function App() {
  const page = useStore((s) => s.page)
  const multi = page === 'multi'

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-navy-900 text-gray-100">
      {!multi && <Sidebar />}
      <main className="flex-1 overflow-hidden">
        {multi ? (
          <MultiKarte />
        ) : (
          <div className="h-full overflow-y-auto">
            {page === 'dashboard' && <Dashboard />}
            {page === 'members' && <MemberList />}
            {page === 'memberDetail' && <MemberDetail />}
            {page === 'procedures' && <Procedures />}
            {page === 'memberStats' && <MemberStats />}
            {page === 'help' && <Help />}
            {page === 'settings' && <Settings />}
          </div>
        )}
      </main>
    </div>
  )
}
