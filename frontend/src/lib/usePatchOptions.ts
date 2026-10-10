import type { FiltersResponse } from '../api/types'
import { useApi } from '../api/useApi'

/**
 * The patches to offer in the patch filter: every patch while no league, year or split is chosen, and otherwise only
 * those that have games in that selection (asked of the API when the selection changes).
 */
export function usePatchOptions(options: FiltersResponse | null, league: string, year: string, split: string): string[] {
  const chosen = Boolean(league || year || split)
  const query = new URLSearchParams()
  if (league) query.set('league', league)
  if (year) query.set('year', year)
  if (split) query.set('split', split)
  const narrowed = useApi<{ patches: string[] }>(chosen ? `/api/filters/patches?${query}` : null)
  // until the narrowed list arrives (or if it fails), keep showing the full one rather than an empty select
  return (chosen ? narrowed.data?.patches : undefined) ?? options?.patches ?? []
}
