import assert from 'node:assert/strict'
import test from 'node:test'
import { createMusicEmbed } from '../src/services/music.ts'
import { parseLrc, verifyLrc } from '../src/services/lrc.ts'
import { isNewerVersion } from '../src/services/updates.ts'

test('parses LRC metadata, millisecond timestamps and multiple cues', () => {
  const parsed = parseLrc(['[ti:Sample]', '[ar:Artist]', '[offset:250]', '[00:01.50][00:02.25]Line'].join('\n'))
  assert.equal(parsed.metadata.title, 'Sample')
  assert.equal(parsed.metadata.artist, 'Artist')
  assert.equal(parsed.metadata.offsetMs, 250)
  assert.deepEqual(parsed.lines.map((line) => line.time), [1.5, 2.25])
  assert.equal(parsed.lines[0].text, 'Line')
})

test('verifies timestamps against media duration and flags out-of-range cues', () => {
  const inRange = verifyLrc(parseLrc('[00:01]First\n[00:10]Last').lines, 12)
  assert.equal(inRange.errors.length, 0)
  const outOfRange = verifyLrc(parseLrc('[02:00]Too late').lines, 90)
  assert.equal(outOfRange.errors.length, 1)
})

test('rejects malformed LRC seconds and reports out-of-order cues', () => {
  const parsed = parseLrc('[00:70]Bad\n[00:08]Later\n[00:02]Earlier')
  assert.equal(parsed.lines.length, 2)
  assert.ok(parsed.warnings.some((warning) => warning.includes('invalid timestamp')))
  assert.ok(parsed.warnings.some((warning) => warning.includes('out of order')))
})

test('builds official embed URLs only for supported provider links', () => {
  assert.equal(createMusicEmbed('youtube', 'https://youtu.be/dQw4w9WgXcQ')?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&enablejsapi=1')
  assert.match(createMusicEmbed('spotify', 'https://open.spotify.com/track/abc123')?.embedUrl || '', /embed\/track\/abc123/)
  assert.equal(createMusicEmbed('deezer', 'https://www.deezer.com/track/12345')?.embedUrl, 'https://widget.deezer.com/widget/dark/track/12345')
  assert.match(createMusicEmbed('soundcloud', 'https://soundcloud.com/artist/track')?.embedUrl || '', /w.soundcloud.com\/player/)
  assert.equal(createMusicEmbed('spotify', 'https://not-spotify.example/track/abc123'), null)
})

test('orders prereleases and stable versions correctly', () => {
  assert.equal(isNewerVersion('v0.1.0-beta.9', '0.1.0-beta.8'), true)
  assert.equal(isNewerVersion('0.1.0-beta.7', '0.1.0-beta.8'), false)
  assert.equal(isNewerVersion('0.1.0', '0.1.0-beta.8'), true)
  assert.equal(isNewerVersion('0.1.0-beta.8', '0.1.0'), false)
})
