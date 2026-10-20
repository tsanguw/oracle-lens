import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import { detailPages, listPages } from './lib/routeChunks'
import { ComingSoon } from './pages/Stubs'

// Every page but the home page is its own chunk, fetched when its route is first visited (Layout shows a placeholder meanwhile).
const ChampionsListPage = lazy(listPages['/champions'])
const LeaderboardPage = lazy(listPages['/players'])
const TeamsListPage = lazy(listPages['/teams'])
const TournamentsListPage = lazy(listPages['/tournaments'])
const PlayerRoute = lazy(() => detailPages().then((m) => ({ default: m.PlayerRoute })))
const TeamRoute = lazy(() => detailPages().then((m) => ({ default: m.TeamRoute })))
const ChampionRoute = lazy(() => detailPages().then((m) => ({ default: m.ChampionRoute })))
const TournamentRoute = lazy(() => detailPages().then((m) => ({ default: m.TournamentRoute })))
const ComparePlayersRoute = lazy(() => detailPages().then((m) => ({ default: m.ComparePlayersRoute })))
const CompareTeamsRoute = lazy(() => detailPages().then((m) => ({ default: m.CompareTeamsRoute })))

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
        <Route path="/compare" element={<Navigate to="/compare/players" replace />} />
        <Route path="/compare/players/:a?/:b?" element={<ComparePlayersRoute />} />
        <Route path="/compare/teams/:a?/:b?" element={<CompareTeamsRoute />} />
        <Route path="*" element={<ComingSoon title="Page not found" />} />
      </Route>
    </Routes>
  )
}
