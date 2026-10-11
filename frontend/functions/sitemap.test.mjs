// Run with `node --test functions/` (no dependencies). Covers the sitemap and robots builders and the two functions.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { buildRobots, buildSitemap, MAX_URLS, STATIC_PATHS } from './lib/sitemap.js'
import { onRequest as robots } from './robots.txt.js'
import { onRequest as sitemap } from './sitemap.xml.js'

const origin = 'https://example.test'
const data = {
  players: [
    { name: 'Faker', lastmod: '2025-03-10' },
    { name: 'Zeka (Kim Geon-woo)', lastmod: null },
    { name: 'A&B <x>', lastmod: '2024-01-01' },
  ],
  teams: [{ name: 'Dplus Kia', lastmod: '2025-04-20' }],
  champions: [{ name: "Kai'Sa" }],
  tournaments: [
    { id: 587, slug: 'worlds-2025', lastmod: '2025-11-09' },
    { id: 12, lastmod: null },
  ],
}

describe('buildSitemap', () => {
  const xml = buildSitemap(origin, data)
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])

  it('is a urlset with the fixed pages first', () => {
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
    assert.deepEqual(locs.slice(0, STATIC_PATHS.length), [`${origin}/`, `${origin}/players`, `${origin}/teams`, `${origin}/champions`, `${origin}/tournaments`])
  })

  it('lists every entity at the address the site uses for it, with names encoded', () => {
    assert.ok(locs.includes(`${origin}/players/Faker`))
    assert.ok(locs.includes(`${origin}/players/Zeka%20(Kim%20Geon-woo)`))
    assert.ok(locs.includes(`${origin}/teams/Dplus%20Kia`))
    // an apostrophe is left alone by encodeURIComponent, so XML escaping is what keeps the file valid
    assert.ok(locs.includes(`${origin}/champions/Kai&apos;Sa`))
    assert.ok(locs.includes(`${origin}/tournaments/worlds-2025`))
    assert.ok(!locs.includes(`${origin}/tournaments/587`), 'a tournament with a slug is listed at the slug, not the old id')
    // an API that does not send slugs yet still gets a working address
    assert.ok(locs.includes(`${origin}/tournaments/12`))
  })

  it('escapes anything that would break the XML', () => {
    assert.ok(!xml.includes('A&B'), 'a raw ampersand must not appear')
    assert.ok(locs.includes(`${origin}/players/A%26B%20%3Cx%3E`))
  })

  it('adds lastmod only where a date is known', () => {
    assert.match(xml, /<loc>https:\/\/example\.test\/players\/Faker<\/loc><lastmod>2025-03-10<\/lastmod>/)
    assert.match(xml, /<loc>https:\/\/example\.test\/players\/Zeka%20\(Kim%20Geon-woo\)<\/loc><\/url>/)
  })

  it('survives an empty or malformed payload', () => {
    assert.equal([...buildSitemap(origin, null).matchAll(/<loc>/g)].length, STATIC_PATHS.length)
    assert.equal([...buildSitemap(origin, { players: 'nope' }).matchAll(/<loc>/g)].length, STATIC_PATHS.length)
  })

  it('never lists more than 50,000 URLs', () => {
    const many = { players: Array.from({ length: MAX_URLS + 10 }, (_, i) => ({ name: `P${i}`, lastmod: null })) }
    assert.equal([...buildSitemap(origin, many).matchAll(/<loc>/g)].length, MAX_URLS)
  })
})

describe('buildRobots', () => {
  it('allows crawling and names the sitemap on the same site', () => {
    assert.equal(buildRobots(origin), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`)
  })
})

describe('the functions', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const ask = (path = '/sitemap.xml', method = 'GET') => ({ request: new Request(`${origin}${path}`, { method }), env: { VITE_API_BASE: 'https://api.example.test/' }, waitUntil() {} })

  it('serves robots.txt as plain text with the request origin', async () => {
    const res = robots(ask('/robots.txt'))
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /^text\/plain/)
    assert.match(await res.text(), /Sitemap: https:\/\/example\.test\/sitemap\.xml/)
  })

  it('builds the sitemap from the API named in the environment and lets it be cached for an hour', async () => {
    let called = ''
    globalThis.fetch = async (url) => {
      called = String(url)
      return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const res = await sitemap(ask())
    assert.equal(called, 'https://api.example.test/api/sitemap')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /^application\/xml/)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600')
    assert.match(await res.text(), /\/players\/Faker/)
  })

  it('answers 503 with Retry-After, uncached, when the API fails', async () => {
    globalThis.fetch = async () => new Response('down', { status: 500 })
    const res = await sitemap(ask())
    assert.equal(res.status, 503)
    assert.equal(res.headers.get('retry-after'), '3600')
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  it('answers HEAD like GET, without a body, so a crawler never gets the home page instead', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(data), { status: 200 })
    const head = await sitemap(ask('/sitemap.xml', 'HEAD'))
    assert.equal(head.status, 200)
    assert.match(head.headers.get('content-type'), /^application\/xml/)
    assert.equal(await head.text(), '')
    const robotsHead = robots(ask('/robots.txt', 'HEAD'))
    assert.equal(robotsHead.status, 200)
    assert.match(robotsHead.headers.get('content-type'), /^text\/plain/)
    assert.equal(await robotsHead.text(), '')
  })

  it('refuses other methods with 405 and an Allow header', async () => {
    for (const handler of [sitemap, robots]) {
      const res = await handler(ask('/x', 'POST'))
      assert.equal(res.status, 405)
      assert.equal(res.headers.get('allow'), 'GET, HEAD')
    }
  })

  it('answers 503 when the API cannot be reached at all', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed')
    }
    assert.equal((await sitemap(ask())).status, 503)
  })
})
