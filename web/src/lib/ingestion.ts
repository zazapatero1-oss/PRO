/** Splits pasted questionnaire text into ~6k-character chunks at blank lines, preferring section headings. */
export function splitForIngestion(text: string, max = 6000): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let cur = ''
  for (const p of paras) {
    const heading = /^[A-Z][A-Z0-9 ™\-–—:]{6,}$/.test(p.split('\n')[0])
    if (cur && (cur.length + p.length + 2 > max || (heading && cur.length > max / 2))) {
      chunks.push(cur)
      cur = ''
    }
    cur = cur ? `${cur}\n\n${p}` : p
  }
  if (cur) chunks.push(cur)
  return chunks.length ? chunks : [text]
}
