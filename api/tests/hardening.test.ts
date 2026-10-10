import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'

afterAll(() => pool.end())

describe('API hardening', () => {
  it('does not announce what it is built with', async () => {
    const res = await request(createApp()).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('answers 429 once an address passes its per-minute allowance, with a JSON message, and never limits the health check', async () => {
    const app = createApp({ rateLimitPerMinute: 3 })
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) statuses.push((await request(app).get('/api/meta/last-updated')).status)
    expect(statuses.slice(0, 3).every((s) => s === 200)).toBe(true)
    expect(statuses.slice(3)).toEqual([429, 429])
    const blocked = await request(app).get('/api/meta/last-updated')
    expect(blocked.body.error).toMatch(/too many requests/i)
    expect(blocked.headers['ratelimit']).toBeDefined()
    expect((await request(app).get('/healthz')).status).toBe(200)
  })

  it('counts each visitor separately behind a proxy', async () => {
    const app = createApp({ rateLimitPerMinute: 1 })
    const first = await request(app).get('/api/meta/last-updated').set('X-Forwarded-For', '203.0.113.1')
    const other = await request(app).get('/api/meta/last-updated').set('X-Forwarded-For', '203.0.113.2')
    const again = await request(app).get('/api/meta/last-updated').set('X-Forwarded-For', '203.0.113.1')
    expect([first.status, other.status, again.status]).toEqual([200, 200, 429])
  })

  it('allows every origin by default and only the listed ones when CORS_ORIGIN is set', async () => {
    const open = await request(createApp({ rateLimitPerMinute: 0 })).get('/healthz').set('Origin', 'https://anything.example')
    expect(open.headers['access-control-allow-origin']).toBe('*')

    const app = createApp({ rateLimitPerMinute: 0, corsOrigin: 'https://site.pages.dev, https://example.org' })
    const ok = await request(app).get('/healthz').set('Origin', 'https://site.pages.dev')
    const second = await request(app).get('/healthz').set('Origin', 'https://example.org')
    const other = await request(app).get('/healthz').set('Origin', 'https://evil.example')
    expect(ok.headers['access-control-allow-origin']).toBe('https://site.pages.dev')
    expect(second.headers['access-control-allow-origin']).toBe('https://example.org')
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
  })
})
