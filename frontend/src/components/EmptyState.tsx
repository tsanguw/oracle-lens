export default function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="empty" role="status">
      <h2 className="empty__title">No games match these filters</h2>
      <p className="empty__text">
        Try widening them: pick a different split or year, clear the patch or side, or turn off
        “Domestic only”.
      </p>
      <button type="button" className="btn-reset" onClick={onReset}>
        Reset filters
      </button>
    </div>
  )
}
