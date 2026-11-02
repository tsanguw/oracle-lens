/**
 * The regions the Versus tool compares: the leagues the sync loads (sync/league_aliases.yaml), each rolled up with its
 * predecessors (LCP includes PCS, VCS and LJL before 2025). Kept here so the picker needs no request.
 */
export const REGIONS = [
  { name: 'LCK', area: 'Korea' },
  { name: 'LPL', area: 'China' },
  { name: 'LEC', area: 'Europe' },
  { name: 'LCS', area: 'North America' },
  { name: 'CBLOL', area: 'Brazil' },
  { name: 'LCP', area: 'Asia Pacific' },
] as const

export const areaOf = (name: string): string => REGIONS.find((r) => r.name.toLowerCase() === name.toLowerCase())?.area ?? ''
