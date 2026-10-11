import { useCallback, useEffect, useState } from "react"
import { getJson } from "./api.ts"

export type StatsState<T> =
  | { status: "loading"; data: T | null }
  | { status: "ready"; data: T; loadedAt: Date }
  | { status: "error"; data: T | null; message: string }

export function useStats<T>(path: string, refreshKey = 0): { state: StatsState<T>; reload: () => void } {
  const [state, setState] = useState<StatsState<T>>({ status: "loading", data: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((previous) => ({ status: "loading", data: previous.data }))

    getJson<T>(path, controller.signal)
      .then((data) => setState({ status: "ready", data, loadedAt: new Date() }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : String(error)
        setState((previous) => ({ status: "error", data: previous.data, message }))
      })

    return () => controller.abort()
  }, [path, attempt, refreshKey])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  return { state, reload }
}
