import { useEffect } from 'react'

const SITE = '[Site name]'

/** Sets the browser tab title; `null` gives the bare site name. */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : SITE
  }, [title])
}
