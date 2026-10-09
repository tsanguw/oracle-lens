import type { FiltersResponse } from '../api/types'

type Combo = FiltersResponse['combos'][number]

/** Combinations matching the chosen league (blank = any) and year/split when given. */
function matching(options: FiltersResponse, league: string, year: string, split: string): Combo[] {
  return (options.combos ?? []).filter(
    (c) => (!league || c.league === league) && (!year || String(c.year) === year) && (!split || c.split === split),
  )
}

/** Splits that exist for the chosen league and year, in the order of the full list. */
export function splitsFor(options: FiltersResponse, league: string, year: string): string[] {
  if (!options.combos) return options.splits
  const have = new Set(matching(options, league, year, '').map((c) => c.split))
  return options.splits.filter((s) => have.has(s))
}

/** Years with games for the chosen league and split. */
export function yearsFor(options: FiltersResponse, league: string, split: string): number[] {
  if (!options.combos) return options.years
  const have = new Set(matching(options, league, '', split).map((c) => c.year))
  return options.years.filter((y) => have.has(y))
}

/**
 * After a league, year or split changed, drop a year or split that no longer exists for the new
 * choice (LCS has no Rounds 3-4), so the page never lands on an empty combination.
 */
export function dropInvalid(params: URLSearchParams, options: FiltersResponse | null): URLSearchParams {
  if (!options?.combos) return params
  const league = params.get('league') ?? ''
  const year = params.get('year') ?? ''
  const split = params.get('split') ?? ''
  if (year && !yearsFor(options, league, '').map(String).includes(year)) params.delete('year')
  const y = params.get('year') ?? ''
  if (split && !splitsFor(options, league, y).includes(split)) params.delete('split')
  return params
}
