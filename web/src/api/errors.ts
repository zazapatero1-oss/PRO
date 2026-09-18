export class ApiError extends Error {
  code: string
  retryable: boolean
  status: number

  constructor(message: string, opts: { code?: string; retryable?: boolean; status?: number } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = opts.code ?? 'unknown'
    this.retryable = opts.retryable ?? false
    this.status = opts.status ?? 0
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.retryable
  // Network failures (fetch throws TypeError) are worth one retry.
  return err instanceof TypeError
}
