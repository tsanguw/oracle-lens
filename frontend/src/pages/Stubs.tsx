import { usePageTitle } from '../lib/usePageTitle'

export function ComingSoon({ title }: { title: string }) {
  usePageTitle(title)
  return (
    <main className="main container">
      <h1 className="stub__title">{title}</h1>
      <p className="stub__text">This page is planned for a later milestone.</p>
    </main>
  )
}
