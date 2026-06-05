import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import MemberList from './pages/MemberList'
import MemberDetail from './pages/MemberDetail'

export default function App() {
  const page = useStore((s) => s.page)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-navy-900 text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {page === 'dashboard' && <Dashboard />}
        {page === 'members' && <MemberList />}
        {page === 'memberDetail' && <MemberDetail />}
      </main>
    </div>
  )
}
