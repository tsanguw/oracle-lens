import type pg from 'pg'
import { describe, expect, it } from 'vitest'
import { createResponseCache } from '../src/responseCache.js'

/** A pool that only answers the sync-stamp read, with a stamp the test can move and a failure switch. */
function fakePool(initial: string | null = 'stamp-1') {
  const state = { stamp: initial, reads: 0, fail: false }
  const pool = {
    query: async () => {
      state.reads++
      if (state.fail) throw new Error('database down')
      return { rows: state.stamp === null ? [] : [{ value: state.stamp }] }
    },
  } as unknown as pg.Pool
  return { pool, state }
}

const counter = () => {
  let calls = 0
  return { load: (v = 'value') => async () => `${v}-${++calls}`, calls: () => calls }
}

describe('response cache', () => {
  it('computes once per key while the sync stamp is unchanged', async () => {
    const { pool } = fakePool()
    const cache = createResponseCache(pool)
    const c = counter()
    expect(await cache.get('a', c.load())).toBe('value-1')
    expect(await cache.get('a', c.load())).toBe('value-1')
    expect(await cache.get('b', c.load())).toBe('value-2')
    expect(c.calls()).toBe(2)
  })

  it('recomputes after the nightly sync stamps a new value', async () => {
    const { pool, state } = fakePool()
    const cache = createResponseCache(pool, { versionTtlMs: 0 })
    const c = counter()
    expect(await cache.get('a', c.load())).toBe('value-1')
    state.stamp = 'stamp-2'
    expect(await cache.get('a', c.load())).toBe('value-2')
    expect(await cache.get('a', c.load())).toBe('value-2')
  })

  it('trusts the stamp it read for versionTtlMs before reading it again', async () => {
    const { pool, state } = fakePool()
    let t = 0
    const cache = createResponseCache(pool, { versionTtlMs: 1000, now: () => t })
    const c = counter()
    await cache.get('a', c.load())
    state.stamp = 'stamp-2'
    t = 500
    expect(await cache.get('a', c.load())).toBe('value-1') // stamp not re-read yet
    t = 1500
    expect(await cache.get('a', c.load())).toBe('value-2')
    expect(state.reads).toBe(2)
  })

  it('drops an entry older than maxAgeMs even if the stamp never changed', async () => {
    const { pool } = fakePool()
    let t = 0
    const cache = createResponseCache(pool, { versionTtlMs: 0, maxAgeMs: 1000, now: () => t })
    const c = counter()
    await cache.get('a', c.load())
    t = 999
    expect(await cache.get('a', c.load())).toBe('value-1')
    t = 1000
    expect(await cache.get('a', c.load())).toBe('value-2')
  })

  it('shares one computation between simultaneous requests for a key', async () => {
    const { pool } = fakePool()
    const cache = createResponseCache(pool)
    let calls = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const load = async () => {
      calls++
      await gate
      return 'done'
    }
    const all = Promise.all([cache.get('a', load), cache.get('a', load), cache.get('a', load)])
    await new Promise((r) => setTimeout(r, 5))
    release()
    expect(await all).toEqual(['done', 'done', 'done'])
    expect(calls).toBe(1)
  })

  it('does not keep a failed computation', async () => {
    const { pool } = fakePool()
    const cache = createResponseCache(pool)
    let calls = 0
    const load = async () => {
      if (++calls === 1) throw new Error('boom')
      return 'ok'
    }
    await expect(cache.get('a', load)).rejects.toThrow('boom')
    expect(cache.size()).toBe(0)
    expect(await cache.get('a', load)).toBe('ok')
  })

  it('drops the least recently used entry past maxEntries', async () => {
    const { pool } = fakePool()
    const cache = createResponseCache(pool, { maxEntries: 2 })
    const c = counter()
    await cache.get('a', c.load('a'))
    await cache.get('b', c.load('b'))
    await cache.get('a', c.load('a')) // touch a, so b is the oldest
    await cache.get('c', c.load('c')) // evicts b
    expect(cache.size()).toBe(2)
    expect(c.calls()).toBe(3)
    await cache.get('a', c.load('a'))
    expect(c.calls()).toBe(3) // a survived
    await cache.get('b', c.load('b'))
    expect(c.calls()).toBe(4) // b was recomputed
  })

  it('computes without caching when the sync stamp cannot be read', async () => {
    const { pool, state } = fakePool()
    state.fail = true
    const cache = createResponseCache(pool)
    const c = counter()
    expect(await cache.get('a', c.load())).toBe('value-1')
    expect(await cache.get('a', c.load())).toBe('value-2')
    expect(cache.size()).toBe(0)
  })

  it('works before any sync has run (no stamp yet)', async () => {
    const { pool } = fakePool(null)
    const cache = createResponseCache(pool)
    const c = counter()
    await cache.get('a', c.load())
    await cache.get('a', c.load())
    expect(c.calls()).toBe(1)
  })
})
