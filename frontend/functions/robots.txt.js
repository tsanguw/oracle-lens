// Cloudflare Pages Function for /robots.txt. A function (not a static file) so the Sitemap line always names the
// address the site is being served from, including a custom domain later.
import { buildRobots } from './lib/sitemap.js'

export function onRequestGet({ request }) {
  return new Response(buildRobots(new URL(request.url).origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
