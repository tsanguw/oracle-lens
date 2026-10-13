import { describe, expect, it } from 'vitest'
import { shapeRosters, type RosterRow } from '../src/tournamentRosters.js'

const row = (team: string, page: string, role: string | null, games: number, name = page): RosterRow => ({ team, page, name, role, games })

describe('shapeRosters', () => {
  it('lists teams in standings order, then unlisted teams (a play-in\'s) by name', () => {
    const rows = [row('Zeta', 'z1', 'Mid', 3), row('Alpha', 'a1', 'Mid', 5), row('Bravo', 'b1', 'Mid', 5), row('Yodel', 'y1', 'Mid', 2)]
    expect(shapeRosters(rows, ['Bravo', 'Alpha']).map((t) => t.team)).toEqual(['Bravo', 'Alpha', 'Yodel', 'Zeta'])
  })

  it('orders players Top to Support, unknown roles last, then by games played', () => {
    const rows = [
      row('Alpha', 'sup', 'Support', 9),
      row('Alpha', 'sub', 'Mid', 1),
      row('Alpha', 'mid', 'Mid', 8),
      row('Alpha', 'who', null, 9),
      row('Alpha', 'top', 'Top', 2),
      row('Alpha', 'jg', 'Jungle', 9),
      row('Alpha', 'adc', 'Bot', 9),
    ]
    expect(shapeRosters(rows, [])[0].players.map((p) => p.page)).toEqual(['top', 'jg', 'mid', 'sub', 'adc', 'sup', 'who'])
  })

  it('merges a player\'s rows for one team into one entry under the role played most', () => {
    const rows = [row('Alpha', 'p', 'Mid', 2), row('Alpha', 'p', 'Top', 5), row('Bravo', 'p', 'Mid', 1)]
    const [alpha, bravo] = shapeRosters(rows, ['Alpha', 'Bravo'])
    expect(alpha.players).toEqual([{ page: 'p', name: 'p', role: 'Top', games: 7 }])
    expect(bravo.players).toEqual([{ page: 'p', name: 'p', role: 'Mid', games: 1 }])
  })

  it('returns nothing for no games', () => {
    expect(shapeRosters([], ['Alpha'])).toEqual([])
  })
})
