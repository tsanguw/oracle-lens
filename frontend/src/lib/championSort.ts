import type { TournamentChampion } from '../api/types'

export type ChampionSortKey = 'presence' | 'picks' | 'bans' | 'wins' | 'winRate'

/** Picks a champion needs before its win rate is ranked, as everywhere else on the site. */
export const MIN_PICKS = 5

const value = (c: TournamentChampion, key: ChampionSortKey): number => (key === 'winRate' ? (c.winRate ?? -1) : c[key])

/**
 * The champions in the chosen order, ties broken by presence and then name. By win rate, champions under the minimum
 * sample (one win in one pick is 100%) always come last, whichever way the list runs.
 */
export function sortChampions(champions: TournamentChampion[], key: ChampionSortKey, descending: boolean): TournamentChampion[] {
  const dir = descending ? -1 : 1
  const small = (c: TournamentChampion) => key === 'winRate' && c.picks < MIN_PICKS
  return [...champions].sort((a, b) => {
    if (small(a) !== small(b)) return small(a) ? 1 : -1
    return dir * (value(a, key) - value(b, key)) || b.presence - a.presence || a.champion.localeCompare(b.champion)
  })
}
