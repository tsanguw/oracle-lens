import { z } from 'zod'

export const MIN_SAMPLE = 5

export const filterSchema = z.object({
  league: z.string().min(1).optional(),
  year: z.coerce.number().int().optional(),
  split: z.string().min(1).optional(),
  tournament: z.string().min(1).optional(),
  patch: z.string().min(1).optional(),
  side: z.enum(['blue', 'red']).optional(),
  role: z.enum(['Top', 'Jungle', 'Mid', 'Bot', 'Support']).optional(),
  domestic: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export type Filters = z.infer<typeof filterSchema>

/** True when the visitor chose a league/year/split/tournament/patch, which replaces the default range. */
export const hasRangeFilter = (f: Filters): boolean =>
  Boolean(f.league || f.year || f.split || f.tournament || f.patch)

/**
 * Builds WHERE fragments over the standard aliases:
 * pgm = player_game, g = game, t = tournament, l = league.
 */
export function buildConditions(f: Filters, params: unknown[]): string[] {
  const p = (value: unknown) => `$${params.push(value)}`
  const conds: string[] = []
  if (f.league) conds.push(`l.name = ${p(f.league)}`)
  if (f.year) conds.push(`t.year = ${p(f.year)}`)
  if (f.split) conds.push(`t.split = ${p(f.split)}`)
  if (f.tournament) {
    const v = p(f.tournament)
    conds.push(`(t.name = ${v} OR t.leaguepedia_name = ${v})`)
  }
  if (f.patch) conds.push(`g.patch = ${p(f.patch)}`)
  if (f.side) conds.push(`pgm.side = ${p(f.side)}`)
  if (f.role) conds.push(`pgm.role = ${p(f.role)}`)
  if (f.domestic) conds.push('t.is_international = false')
  return conds
}
