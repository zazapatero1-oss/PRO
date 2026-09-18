/** Accepts a full URL, a `/p/<token>` path, or a bare token. */
export function tokenFromInput(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const m = s.match(/\/p\/([A-Za-z0-9_-]+)/)
  if (m) return m[1]
  if (/^[A-Za-z0-9_-]{4,}$/.test(s)) return s
  return null
}
