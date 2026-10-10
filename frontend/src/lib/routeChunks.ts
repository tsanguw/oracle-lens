/*
 * The lazily loaded pages, in one place: App turns each into a route, and the nav starts loading a page's chunk when
 * its link is hovered or focused, so the click usually finds it already there.
 */
export const listPages = {
  '/players': () => import('../pages/LeaderboardPage'),
  '/teams': () => import('../pages/TeamsListPage'),
  '/champions': () => import('../pages/ChampionsListPage'),
  '/tournaments': () => import('../pages/TournamentsListPage'),
}
export const detailPages = () => import('../pages/DetailRoutes')

/** Starts fetching the chunk for a nav path (a no-op for paths with none, or if it is already loaded). */
export function preloadRoute(path: string): void {
  const load = listPages[path as keyof typeof listPages]
  if (load) void load()
}
