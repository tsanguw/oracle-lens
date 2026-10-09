import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ChampionsListPage from './pages/ChampionsListPage'
import LeaderboardPage from './pages/LeaderboardPage'
import TeamsListPage from './pages/TeamsListPage'
import TournamentsListPage from './pages/TournamentsListPage'
import { ChampionRoute, ComingSoon, PlayerRoute, TeamRoute, TournamentRoute } from './pages/Stubs'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/players" element={<LeaderboardPage />} />
        <Route path="/players/:name" element={<PlayerRoute />} />
        <Route path="/teams" element={<TeamsListPage />} />
        <Route path="/champions" element={<ChampionsListPage />} />
        <Route path="/tournaments" element={<TournamentsListPage />} />
        <Route path="/teams/:name" element={<TeamRoute />} />
        <Route path="/champions/:name" element={<ChampionRoute />} />
        <Route path="/tournaments/:id" element={<TournamentRoute />} />
        <Route path="*" element={<ComingSoon title="Page not found" />} />
      </Route>
    </Routes>
  )
}
