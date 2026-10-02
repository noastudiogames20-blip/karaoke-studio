export type LyricLine = { time: number; text: string }
export type LrcMetadata = { title?: string; artist?: string; album?: string; offsetMs: number }
export type LrcParseResult = { lines: LyricLine[]; metadata: LrcMetadata; warnings: string[] }
export type LrcVerification = { errors: string[]; warnings: string[]; durationSeconds: number; lastTimestamp: number; coveragePercent: number }

const timestampPattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g

export function parseLrc(content: string): LrcParseResult {
  const lines: LyricLine[] = []
  const warnings: string[] = []
  const metadata: LrcMetadata = { offsetMs: 0 }
  let previousTimestamp = -1

  for (const [lineNumber, rawLine] of content.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    const tag = line.match(/^\[(ti|ar|al|offset):([^\]]*)\]$/i)
    if (tag) {
      const value = tag[2].trim()
      if (tag[1].toLowerCase() === 'ti') metadata.title = value
      else if (tag[1].toLowerCase() === 'ar') metadata.artist = value
      else if (tag[1].toLowerCase() === 'al') metadata.album = value
      else if (Number.isFinite(Number(value))) metadata.offsetMs = Number(value)
      continue
    }

    const matches = [...rawLine.matchAll(timestampPattern)]
    if (!matches.length) continue
    const text = rawLine.replace(timestampPattern, '').trim()
    for (const match of matches) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      if (seconds >= 60) {
        warnings.push(`Line ${lineNumber + 1}: invalid timestamp seconds (${seconds}).`)
        continue
      }
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0')}`) : 0
      const time = minutes * 60 + seconds + fraction
      if (previousTimestamp >= 0 && time < previousTimestamp) warnings.push(`Line ${lineNumber + 1}: timestamp is out of order; lines were sorted.`)
      previousTimestamp = time
      lines.push({ time, text })
    }
  }
  lines.sort((left, right) => left.time - right.time)
  return { lines, metadata, warnings: [...new Set(warnings)] }
}

export function verifyLrc(lines: LyricLine[], duration: number): LrcVerification {
  const errors: string[] = []
  const warnings: string[] = []
  if (!lines.length) errors.push('No timestamped lyric lines were found.')
  const validDuration = Number.isFinite(duration) && duration > 0
  if (!validDuration) warnings.push('Load a media track to compare lyric timestamps with its duration.')

  const lastTimestamp = lines.at(-1)?.time ?? 0
  if (validDuration && lines.some((line) => line.time > duration)) errors.push(`${lines.filter((line) => line.time > duration).length} lyric timestamp(s) are beyond the ${Math.round(duration)} second track.`)
  if (lines.length > 1) {
    const repeated = lines.filter((line, index) => index > 0 && line.time === lines[index - 1].time).length
    if (repeated) warnings.push(`${repeated} repeated timestamp(s) found; check those lyric cues.`)
    const longGaps = lines.slice(1).filter((line, index) => line.time - lines[index].time > 20).length
    if (longGaps) warnings.push(`${longGaps} gap(s) longer than 20 seconds; these may be instrumental sections or missing lyrics.`)
  }
  if (validDuration && lines.length) {
    if (lines[0].time > Math.min(30, duration * 0.25)) warnings.push('The first lyric starts late; confirm the instrumental intro is intentional.')
    if (duration - lastTimestamp > Math.max(25, duration * 0.2)) warnings.push('The last lyric ends well before the track; confirm the outro or missing final lines.')
  }
  const coveragePercent = validDuration ? Math.min(100, Math.round((lastTimestamp / duration) * 100)) : 0
  return { errors, warnings, durationSeconds: validDuration ? duration : 0, lastTimestamp, coveragePercent }
}
