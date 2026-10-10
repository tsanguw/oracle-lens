import { useEffect } from 'react'

const SITE = 'Oracle Lens'

/** Sets the browser tab title ("Faker · Oracle Lens"); `null` gives the site name with its tagline, for the home page. */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : `${SITE} · Pro League of Legends stats`
  }, [title])
}
