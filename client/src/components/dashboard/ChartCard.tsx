import type { ReactNode } from "react"
import type { StatsState } from "../../useStats.ts"

type Props<T> = {
  title: string
  description: string
  state: StatsState<T>
  isEmpty: (data: T) => boolean
  emptyMessage: string
  wide?: boolean
  children: (data: T) => ReactNode
}

export function ChartCard<T>({ title, description, state, isEmpty, emptyMessage, wide, children }: Props<T>) {
  const data = state.data

  return (
    <section className={wide ? "chart-card chart-card-wide" : "chart-card"} aria-busy={state.status === "loading"}>
      <h2 className="chart-title">{title}</h2>
      <p className="chart-description">{description}</p>
      <div className="chart-body">
        {data === null && state.status === "loading" && <div className="skeleton chart-skeleton" />}
        {data === null && state.status === "error" && <p className="chart-message">Couldn't load this chart. {state.message}</p>}
        {data !== null && isEmpty(data) && <p className="chart-message">{emptyMessage}</p>}
        {data !== null && !isEmpty(data) && children(data)}
      </div>
    </section>
  )
}
