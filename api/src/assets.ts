import type pg from 'pg'

export interface ImageManifest {
  /** Riot Data Dragon version used to build champion icon URLs; null until the sync has run. */
  ddragonVersion: string | null
  /** Champion name -> Data Dragon key (e.g. "Wukong" -> "MonkeyKing"). */
  champions: Record<string, string>
  /** Team name -> cached logo file name. */
  teams: Record<string, string>
  /** Team name -> 'dark' or 'light' for logos measured as mostly dark or mostly light; other logos are left out. */
  teamTones: Record<string, 'dark' | 'light'>
  /** Player page name -> cached photo file name. */
  players: Record<string, string>
}

/**
 * Which entities have an image, in one small payload. The front end loads it once and looks names up
 * locally, so list pages need no extra fields per row. Only entities with an image are included.
 */
export async function loadImageManifest(pool: pg.Pool): Promise<ImageManifest> {
  const [version, champions, teams, players] = await Promise.all([
    pool.query(`SELECT value FROM meta WHERE key = 'ddragon_version'`),
    pool.query(`SELECT name, icon_key FROM champion WHERE icon_key IS NOT NULL`),
    pool.query(`SELECT name, logo_file, logo_tone FROM team WHERE logo_file IS NOT NULL`),
    pool.query(`SELECT name, photo_file FROM player WHERE photo_file IS NOT NULL`),
  ])
  const toMap = (rows: { name: string }[], column: string) =>
    Object.fromEntries(rows.map((r) => [r.name, (r as unknown as Record<string, string>)[column]]))
  return {
    ddragonVersion: version.rows[0]?.value ?? null,
    champions: toMap(champions.rows, 'icon_key'),
    teams: toMap(teams.rows, 'logo_file'),
    teamTones: Object.fromEntries(
      teams.rows.filter((r) => r.logo_tone === 'dark' || r.logo_tone === 'light').map((r) => [r.name, r.logo_tone]),
    ),
    players: toMap(players.rows, 'photo_file'),
  }
}
