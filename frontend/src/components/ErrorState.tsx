interface Props {
  message: string
  onRetry: () => void
  heading?: string
  /** Heading level, so each page keeps a sensible outline (h1 when the error replaces the whole page). */
  level?: 1 | 2 | 3
}

export default function ErrorState({ message, onRetry, heading = 'Something went wrong', level = 2 }: Props) {
  const Heading = `h${level}` as const
  return (
    <div className="empty" role="alert">
      <Heading className="empty__title">{heading}</Heading>
      <p className="empty__text">{message}. Check your connection and try again.</p>
      <button type="button" className="btn-reset" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
