import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import LeaderboardPage from './pages/LeaderboardPage'
import { ComingSoon, PlayerRoute } from './pages/Stubs'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ComingSoon title="[Site name]" />} />
        <Route path="/players" element={<LeaderboardPage />} />
        <Route path="/players/:name" element={<PlayerRoute />} />
        <Route path="/teams" element={<ComingSoon title="Teams" />} />
        <Route path="/champions" element={<ComingSoon title="Champions" />} />
        <Route path="/tournaments" element={<ComingSoon title="Tournaments" />} />
        <Route path="*" element={<ComingSoon title="Page not found" />} />
      </Route>
    </Routes>
  )
}
