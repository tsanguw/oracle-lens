import type pg from 'pg'

export interface ResponseCacheOptions {
  /** Entries kept before the least recently used one is dropped. */
  maxEntries?: number
  /** How long a read of the sync stamp is trusted; 0 reads it on every call. */
  versionTtlMs?: number
  /** Longest an entry lives even if the sync stamp never changes (rosters and name repairs do not bump it). */
  maxAgeMs?: number
  now?: () => number
}

interface Entry {
  version: string | null
  storedAt: number
  value: Promise<unknown>
}

/**
 * A small in-process cache for responses that are slow to compute and only change when the nightly sync
 * writes new data. Entries are tied to `meta.last_synced_at`: when the sync stamps a new value the old
 * entries stop matching. Simultaneous requests for one key share a single computation, a failed
 * computation is never kept, and the least recently used entry is dropped past `maxEntries`.
 * Process memory only: a restart (Render's free tier sleeps) starts cold.
 */
export function createResponseCache(pool: pg.Pool, options: ResponseCacheOptions = {}) {
  const maxEntries = options.maxEntries ?? 200
  const versionTtlMs = options.versionTtlMs ?? 60_000
  const maxAgeMs = options.maxAgeMs ?? 60 * 60_000
  const now = options.now ?? Date.now
  const entries = new Map<string, Entry>()
  let version: { value: string | null; readAt: number } | null = null

  async function currentVersion(): Promise<{ ok: boolean; value: string | null }> {
    if (version && now() - version.readAt < versionTtlMs) return { ok: true, value: version.value }
    try {
      const { rows } = await pool.query(`SELECT value FROM meta WHERE key = 'last_synced_at'`)
      version = { value: rows[0]?.value ?? null, readAt: now() }
      return { ok: true, value: version.value }
    } catch {
      // Cannot tell whether the data changed, so do not serve from the cache.
      return { ok: false, value: null }
    }
  }

  /** Returns the cached value for `key`, or runs `load` and keeps its result. */
  async function get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const v = await currentVersion()
    if (!v.ok) return load()
    const hit = entries.get(key)
    if (hit && hit.version === v.value && now() - hit.storedAt < maxAgeMs) {
      entries.delete(key)
      entries.set(key, hit) // most recently used goes last
      return hit.value as Promise<T>
    }
    const value = load()
    const entry: Entry = { version: v.value, storedAt: now(), value }
    entries.delete(key)
    entries.set(key, entry)
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string)
    value.catch(() => {
      if (entries.get(key) === entry) entries.delete(key)
    })
    return value
  }

  return { get, size: () => entries.size, clear: () => entries.clear() }
}

export type ResponseCache = ReturnType<typeof createResponseCache>
