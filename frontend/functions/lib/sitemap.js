// Turns the API's list of indexable pages into a sitemap.xml. Plain JavaScript with no imports, so the Cloudflare
// functions and the Node tests in ../sitemap.test.mjs run exactly the same code.

/** The fixed pages, as paths. */
export const STATIC_PATHS = ['/', '/players', '/teams', '/champions', '/tournaments']

/** One sitemap file may list 50,000 URLs at most. */
export const MAX_URLS = 50000

const escapeXml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const list = (value) => (Array.isArray(value) ? value : [])

/** A name as it appears in the site's own links (`/players/Zeka%20(Kim%20Geon-woo)`). */
const segment = (name) => encodeURIComponent(String(name))

/**
 * `data` is the API's `/api/sitemap` payload: `{ players, teams, champions, tournaments }`.
 * Returns the XML as a string, with each address on `origin` (so it follows the site to a custom domain).
 */
export function buildSitemap(origin, data) {
  const entries = [
    ...STATIC_PATHS.map((path) => ({ path, lastmod: null })),
    ...list(data?.champions).map((c) => ({ path: `/champions/${segment(c.name)}`, lastmod: null })),
    ...list(data?.tournaments).map((t) => ({ path: `/tournaments/${t.id}`, lastmod: t.lastmod ?? null })),
    ...list(data?.teams).map((t) => ({ path: `/teams/${segment(t.name)}`, lastmod: t.lastmod ?? null })),
    ...list(data?.players).map((p) => ({ path: `/players/${segment(p.name)}`, lastmod: p.lastmod ?? null })),
  ].slice(0, MAX_URLS)

  const urls = entries.map(({ path, lastmod }) => {
    const loc = escapeXml(`${origin}${path}`)
    return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

/**
 * Cloudflare Pages falls through to the app's HTML page for any method a function does not handle, so a HEAD request
 * (which crawlers send) would get the home page. Both functions handle GET and HEAD, and refuse everything else.
 * Returns a ready Response for a refused method, otherwise null.
 */
export function refuseOtherMethods(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return null
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' } })
}

/** The same response for HEAD as for GET, without the body. */
export function forMethod(response, method) {
  return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
}

/** The robots.txt body: everything may be crawled, and the sitemap is on the same site. */
export function buildRobots(origin) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
}
