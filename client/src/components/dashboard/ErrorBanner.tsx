type Props = {
  message: string
  onRetry: () => void
  stale: boolean
}

export function ErrorBanner({ message, onRetry, stale }: Props) {
  return (
    <div className="error-banner" role="alert">
      <div>
        <p className="error-title">Couldn't load the stats</p>
        <p className="error-message">{message}</p>
        {stale && <p className="error-message">The numbers below are from the last successful load.</p>}
      </div>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
