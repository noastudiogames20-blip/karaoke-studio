export type LrcLibTrack = {
  id: number
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export async function searchLrcLib(title: string, artist = ''): Promise<LrcLibTrack[]> {
  const query = [title.trim(), artist.trim()].filter(Boolean).join(' ')
  if (!query) return []
  const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`LRCLIB request failed (${response.status})`)
  const results = await response.json() as LrcLibTrack[]
  return results.slice(0, 20)
}

export function rankLrcLibMatches(results: LrcLibTrack[], durationSeconds: number) {
  if (!durationSeconds) return results
  return [...results].sort((a, b) => Math.abs(a.duration - durationSeconds) - Math.abs(b.duration - durationSeconds))
}
