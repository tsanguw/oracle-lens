import { useEffect, useState } from 'react'
import { apiUrl } from './base'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface ApiState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  /** Fetch again, for a Retry button. */
  reload: () => void
}

/** Fetches `path` (relative, e.g. /api/players/x?year=2026); refetches when it changes. */
export function useApi<T>(path: string): ApiState<T> {
  const [state, setState] = useState<Omit<ApiState<T>, 'reload'>>({ data: null, error: null, loading: true })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    fetch(apiUrl(path), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(res.status, res.status === 404 ? 'Not found' : 'Request failed')
        return (await res.json()) as T
      })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof ApiError ? err : new ApiError(0, 'Could not reach the server')
        setState({ data: null, error, loading: false })
      })
    return () => controller.abort()
  }, [path, attempt])

  return { ...state, reload: () => setAttempt((n) => n + 1) }
}
