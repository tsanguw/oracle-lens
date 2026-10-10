import { useEffect, useState } from 'react'
import { apiUrl } from '../api/base'

/*
 * Champion icons come from Riot's Data Dragon CDN; team logos and player photos are files cached by the sync
 * (python main.py images) under /img. Every component falls back to a neutral box or initials when an image is
 * unknown or fails to load, so the pages work before the sync has run and for the many teams and players
 * Leaguepedia has no picture for.
 */

const IMAGE_BASE: string = (import.meta.env.VITE_IMAGE_BASE as string | undefined) ?? '/img'
const DDRAGON = 'https://ddragon.leagueoflegends.com'

interface Manifest {
  ddragonVersion: string | null
  champions: Record<string, string>
  teams: Record<string, string>
  teamTones: Record<string, 'dark' | 'light'>
  players: Record<string, string>
}

const EMPTY: Manifest = { ddragonVersion: null, champions: {}, teams: {}, teamTones: {}, players: {} }

let loaded: Manifest | null = null
let pending: Promise<Manifest> | null = null

function loadManifest(): Promise<Manifest> {
  pending ??= fetch(apiUrl('/api/assets/images'))
    .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : Promise.reject(new Error('manifest'))))
    .then((m) => (loaded = { ...EMPTY, ...m })) // an older API may not send every field yet
    .catch(() => {
      pending = null // try again on the next page; meanwhile every image shows its fallback
      return EMPTY
    })
  return pending
}

/** Starts fetching the manifest now, so headers that need it (for the art's file names) are not waiting on it later. */
export function prefetchImages(): void {
  void loadManifest()
}

/** The image manifest, fetched once per visit and shared by every component. */
export function useImages(): Manifest {
  const [manifest, setManifest] = useState<Manifest>(loaded ?? EMPTY)
  useEffect(() => {
    if (loaded) return
    let live = true
    void loadManifest().then((m) => {
      if (live) setManifest(m)
    })
    return () => {
      live = false
    }
  }, [])
  return manifest
}

/** Up to two initials for a name: "Gen.G" -> "GG", "Team Liquid" -> "TL", "T1" -> "T1". */
export function initials(name: string): string {
  const words = name.split(/[\s.\-_]+/).filter(Boolean)
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [...(words[0] ?? '?')].slice(0, 2)
  return letters.join('').toUpperCase()
}

const ROLE_CLASS: Record<string, string> = { top: 'top', jungle: 'jungle', mid: 'mid', bot: 'bot', support: 'support' }

/** Players with no photo get an initials avatar tinted by role, so a list of them is still easy to scan. */
function roleClass(role?: string | null): string {
  const key = role ? ROLE_CLASS[role.toLowerCase()] : undefined
  return key ? `avatar--${key}` : ''
}

interface BaseProps {
  size?: number
  className?: string
  /** Load immediately instead of lazily, for images at the top of the page. */
  eager?: boolean
}

export function ChampionIcon({ name, size = 32, className = '', eager = false }: BaseProps & { name: string }) {
  const { champions, ddragonVersion } = useImages()
  const [failed, setFailed] = useState(false)
  const key = champions[name]
  const style = { width: size, height: size }
  if (!key || !ddragonVersion || failed) return <span className={`icon-box ${className}`} style={style} aria-hidden="true" />
  return (
    <img
      className={`img img--icon ${className}`}
      src={`${DDRAGON}/cdn/${ddragonVersion}/img/champion/${key}.png`}
      alt=""
      width={size}
      height={size}
      loading={eager || size >= 96 ? 'eager' : 'lazy'}
      fetchPriority={eager || size >= 96 ? 'high' : undefined}
      onError={() => setFailed(true)}
    />
  )
}

export function TeamLogo({ name, size = 28, className = '', eager = false }: BaseProps & { name: string }) {
  const { teams, teamTones } = useImages()
  const [failed, setFailed] = useState(false)
  const file = teams[name]
  // Mostly-dark artwork would disappear on our dark panels, so it sits on a light plate.
  const plate = teamTones[name] === 'dark' ? ' img--plate' : ''
  const style = { width: size, height: size }
  if (!file || failed) {
    return (
      <span className={`avatar avatar--team ${className}`} style={{ ...style, fontSize: Math.max(10, size * 0.38) }} aria-hidden="true">
        {initials(name)}
      </span>
    )
  }
  return (
    <img
      className={`img img--logo${plate} ${className}`}
      src={`${IMAGE_BASE}/teams/${file}`}
      alt=""
      width={size}
      height={size}
      style={plate ? { padding: Math.max(1, Math.round(size * 0.14)) } : undefined}
      loading={eager || size >= 96 ? 'eager' : 'lazy'}
      fetchPriority={eager || size >= 96 ? 'high' : undefined}
      onError={() => setFailed(true)}
    />
  )
}

/** `page` is the player's unique page name (the key photos are stored under); `name` is what to show initials for. */
export function PlayerPhoto({ page, name, role, size = 36, className = '', eager = false }: BaseProps & { page: string; name: string; role?: string | null }) {
  const { players } = useImages()
  const [failed, setFailed] = useState(false)
  const file = players[page]
  const style = { width: size, height: size }
  if (!file || failed) {
    return (
      <span className={`avatar ${roleClass(role)} ${className}`} style={{ ...style, fontSize: Math.max(10, size * 0.38) }} aria-hidden="true">
        {initials(name)}
        {size >= 96 && role && <span className="avatar__role">{role}</span>}
      </span>
    )
  }
  return (
    <img
      className={`img img--photo ${className}`}
      src={`${IMAGE_BASE}/players/${file}`}
      alt=""
      width={size}
      height={size}
      loading={eager || size >= 96 ? 'eager' : 'lazy'}
      fetchPriority={eager || size >= 96 ? 'high' : undefined}
      onError={() => setFailed(true)}
    />
  )
}
