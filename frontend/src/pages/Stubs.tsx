import { usePageMeta } from '../lib/usePageMeta'

export function ComingSoon({ title }: { title: string }) {
  // only the not-found page uses this, and it must not appear in search results
  usePageMeta({ title, noindex: true })
  return (
    <main className="main container">
      <h1 className="stub__title">{title}</h1>
      <p className="stub__text">This page is planned for a later milestone.</p>
    </main>
  )
}
