type Props = {
  label: string
  value: string | null
  detail: string
  loading: boolean
}

export function SummaryCard({ label, value, detail, loading }: Props) {
  return (
    <section className="card" aria-busy={loading}>
      <h2 className="card-label">{label}</h2>
      {loading ? (
        <>
          <div className="skeleton skeleton-value" />
          <div className="skeleton skeleton-detail" />
        </>
      ) : (
        <>
          <p className="card-value">{value ?? "—"}</p>
          <p className="card-detail">{detail}</p>
        </>
      )}
    </section>
  )
}
