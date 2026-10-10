import type { StageRound, StageSeries } from '../api/types'

/*
 * Places the series of a knockout stage on a canvas. Columns are the rounds, left to right. Within a column a series sits
 * level with the middle of the series its teams won their way out of, so a single-elimination bracket narrows into a
 * tree. In a double-elimination bracket the upper lane goes on top and the lower lane below it; a lower series fed only
 * by teams that dropped down has no winner link to follow, so those stack in order at the top of the lower lane.
 */

export const CARD_W = 226
export const CARD_H = 58
export const COL_GAP = 52
export const ROW_GAP = 14
export const HEAD_H = 44
const LANE_GAP = 36

export interface Placed {
  series: StageSeries
  column: number
  x: number
  y: number
}

export interface Link {
  /** Where the line leaves the earlier series and where it enters the later one. */
  from: { x: number; y: number }
  to: { x: number; y: number }
  /** How the team left the earlier series: won it (a bold line), lost it and dropped down (a dashed one), or it is unplayed. */
  kind: 'won' | 'drop' | 'open'
}

export interface BracketLayout {
  width: number
  height: number
  placed: Placed[]
  links: Link[]
  heads: { name: string; x: number }[]
}

const slotY = (top: number, side: number) => top + (side === 0 ? CARD_H * 0.25 : CARD_H * 0.75)

/** Space the cards in one column of one lane so none overlap, keeping the wanted order and, where possible, the wanted position. */
function settle(items: { id: number; want: number | null }[], top: number): Map<number, number> {
  const out = new Map<number, number>()
  let free = top
  for (const item of items) {
    const y = Math.max(free, item.want ?? free)
    out.set(item.id, y)
    free = y + CARD_H + ROW_GAP
  }
  return out
}

export function layoutBracket(rounds: StageRound[]): BracketLayout {
  const byId = new Map<number, Placed>()
  const placed: Placed[] = []
  const columnX = (c: number) => c * (CARD_W + COL_GAP)

  // a series wants to sit level with the middle of the series its teams won out of
  const wanted = (s: StageSeries): number | null => {
    const mids = s.slots
      .map((x) => (x.from && x.from.as !== 'lost' ? byId.get(x.from.seriesId) : undefined))
      .filter((p): p is Placed => p !== undefined)
      .map((p) => p.y + CARD_H / 2)
    return mids.length ? mids.reduce((a, b) => a + b, 0) / mids.length - CARD_H / 2 : null
  }

  const lanes = ['upper', 'lower', 'final'] as const
  let laneTop = HEAD_H
  let bottom = HEAD_H
  for (const lane of lanes) {
    if (lane === 'final') laneTop = HEAD_H
    for (const [c, round] of rounds.entries()) {
      const items = round.series
        .filter((s) => (s.lane ?? 'upper') === lane)
        .map((s) => ({ s, want: wanted(s) }))
        .sort((a, b) => (a.want ?? Infinity) - (b.want ?? Infinity) || (a.s.n ?? 0) - (b.s.n ?? 0))
      const ys = settle(items.map((i) => ({ id: i.s.seriesId, want: i.want })), laneTop)
      for (const { s } of items) {
        const p = { series: s, column: c, x: columnX(c), y: ys.get(s.seriesId) ?? laneTop }
        byId.set(s.seriesId, p)
        placed.push(p)
        bottom = Math.max(bottom, p.y + CARD_H)
      }
    }
    if (lane === 'upper') laneTop = bottom + LANE_GAP
  }

  const links: Link[] = []
  for (const p of placed) {
    p.series.slots.forEach((slot, side) => {
      const src = slot.from ? byId.get(slot.from.seriesId) : undefined
      if (!src || !slot.from) return
      const srcSide = src.series.slots.findIndex((x) => x.team === slot.team)
      links.push({
        from: { x: src.x + CARD_W, y: slotY(src.y, Math.max(0, srcSide)) },
        to: { x: p.x, y: slotY(p.y, side) },
        kind: slot.from.as === 'won' ? 'won' : slot.from.as === 'lost' ? 'drop' : 'open',
      })
    })
  }

  return {
    width: columnX(rounds.length) - COL_GAP,
    height: bottom + 8,
    placed,
    links,
    heads: rounds.map((r, c) => ({ name: r.name, x: columnX(c) })),
  }
}
