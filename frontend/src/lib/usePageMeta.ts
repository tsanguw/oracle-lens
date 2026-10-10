import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'Oracle Lens'
const HOME_TITLE = `${SITE} · Pro League of Legends Stats`
const HOME_DESCRIPTION =
  'Oracle Lens: stats for pro League of Legends. Players, teams, champions and tournaments for the LCK, LPL, LEC, LCS, CBLOL and LCP, plus Worlds and MSI, with brackets, leaderboards and shareable filters.'

interface PageMeta {
  /** The page's own name ("Faker stats: win rate, KDA and champion pool"); `null` gives the home page's title. */
  title: string | null
  /** What a search result should say under the title; the home page's description when left out. */
  description?: string
  /** True for pages that must stay out of search results, such as "not found". */
  noindex?: boolean
}

/** Finds the tag matching `selector` in <head>, or adds it, and sets one attribute. */
function setTag(tag: 'meta' | 'link', selector: string, attrs: Record<string, string>, valueAttr: 'content' | 'href', value: string) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) {
    el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    document.head.appendChild(el)
  }
  el.setAttribute(valueAttr, value)
}

/**
 * Keeps the tab title and everything a search engine reads from <head> in step with the page on screen: title,
 * description, canonical address (the path without the query string, so filtered views count as one page), the share
 * tags, and a noindex marker where asked. The site is a single-page app, so this runs in the browser; Google renders
 * JavaScript and reads the result.
 */
export function usePageMeta({ title, description = HOME_DESCRIPTION, noindex = false }: PageMeta): void {
  const { pathname } = useLocation()
  useEffect(() => {
    const fullTitle = title ? `${title} · ${SITE}` : HOME_TITLE
    // the address as the browser has it, without a trailing slash (except for the home page) or a query string
    const path = window.location.pathname.replace(/(.)\/+$/, '$1')
    const url = `${window.location.origin}${path}`
    document.title = fullTitle
    setTag('meta', 'meta[name="description"]', { name: 'description' }, 'content', description)
    setTag('link', 'link[rel="canonical"]', { rel: 'canonical' }, 'href', url)
    setTag('meta', 'meta[property="og:title"]', { property: 'og:title' }, 'content', fullTitle)
    setTag('meta', 'meta[property="og:description"]', { property: 'og:description' }, 'content', description)
    setTag('meta', 'meta[property="og:url"]', { property: 'og:url' }, 'content', url)
    let robots: HTMLMetaElement | null = null
    if (noindex) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      robots.content = 'noindex'
      document.head.appendChild(robots)
    }
    return () => robots?.remove()
  }, [title, description, noindex, pathname])
}

/** Adds one schema.org JSON-LD block to <head> while the page is shown; nothing when `data` is null (still loading). */
export function useJsonLd(data: Record<string, unknown> | null): void {
  const json = data ? JSON.stringify(data) : null
  useEffect(() => {
    if (!json) return
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.textContent = json
    document.head.appendChild(el)
    return () => el.remove()
  }, [json])
}
