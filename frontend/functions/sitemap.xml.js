// Cloudflare Pages Function for /sitemap.xml. The list of pages comes from the API (it changes when the nightly sync
// runs); the answer is cached for an hour, so a visit to this address almost never reaches the API. Google needs the
// sitemap on the same site as the pages it lists, which is why this is a function here and not a file on the API.
import { buildSitemap, forMethod, refuseOtherMethods } from './lib/sitemap.js'

const FALLBACK_API = 'https://lol-stats-api-p86o.onrender.com'
const ONE_HOUR = 3600

export async function onRequest({ request, env, waitUntil }) {
  const refused = refuseOtherMethods(request)
  if (refused) return refused
  const origin = new URL(request.url).origin
  const cache = typeof caches === 'undefined' ? null : caches.default
  const cacheKey = new Request(`${origin}/sitemap.xml`)

  const cached = cache ? await cache.match(cacheKey) : null
  if (cached) return forMethod(cached, request.method)

  const api = String(env?.VITE_API_BASE || FALLBACK_API).replace(/\/+$/, '')
  let data
  try {
    // generous: the free API host can take a minute to wake up
    const res = await fetch(`${api}/api/sitemap`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(50000) })
    if (!res.ok) throw new Error(`API answered ${res.status}`)
    data = await res.json()
  } catch {
    // a crawler that gets a 503 comes back later; nothing is cached, so the next request tries again
    return forMethod(
      new Response('The sitemap is temporarily unavailable.', {
        status: 503,
        headers: { 'Retry-After': String(ONE_HOUR), 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
      }),
      request.method,
    )
  }

  const response = new Response(buildSitemap(origin, data), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${ONE_HOUR}` },
  })
  if (cache && waitUntil) waitUntil(cache.put(cacheKey, response.clone()))
  return forMethod(response, request.method)
}
