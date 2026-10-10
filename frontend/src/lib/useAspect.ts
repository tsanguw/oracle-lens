import { useEffect, useState } from 'react'

/** The width / height of an element, kept current as it resizes. Use the returned function as the element's ref. */
export function useAspect(initial = 1.6): [(el: HTMLElement | null) => void, number, HTMLElement | null] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [aspect, setAspect] = useState(initial)
  useEffect(() => {
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (height > 0) setAspect(width / height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return [setEl, aspect, el]
}
