export type MusicProvider = 'youtube' | 'spotify' | 'deezer' | 'soundcloud'
export type EmbeddedMusic = { provider: MusicProvider; sourceUrl: string; embedUrl: string; kind: 'track' | 'collection' }

const hosts: Record<MusicProvider, string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'],
  spotify: ['open.spotify.com'],
  deezer: ['deezer.com', 'www.deezer.com'],
  soundcloud: ['soundcloud.com', 'www.soundcloud.com'],
}

export function createMusicEmbed(provider: MusicProvider, rawUrl: string): EmbeddedMusic | null {
  let url: URL
  try { url = new URL(rawUrl.trim()) } catch { return null }
  if (url.protocol !== 'https:' || !hosts[provider].includes(url.hostname.toLowerCase())) return null

  if (provider === 'youtube') {
    const playlistId = url.searchParams.get('list')
    if (playlistId) return { provider, sourceUrl: url.toString(), embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlistId)}`, kind: 'collection' }
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1).split('/')[0] : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null
    return { provider, sourceUrl: url.toString(), embedUrl: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&enablejsapi=1`, kind: 'track' }
  }

  if (provider === 'spotify') {
    const match = url.pathname.match(/^\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)\/?$/)
    if (!match) return null
    return { provider, sourceUrl: url.toString(), embedUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator`, kind: match[1] === 'playlist' || match[1] === 'album' || match[1] === 'show' ? 'collection' : 'track' }
  }

  if (provider === 'deezer') {
    const match = url.pathname.match(/^\/(track|album|playlist)\/(\d+)\/?$/)
    if (!match) return null
    return { provider, sourceUrl: url.toString(), embedUrl: `https://widget.deezer.com/widget/dark/${match[1]}/${match[2]}`, kind: match[1] === 'track' ? 'track' : 'collection' }
  }

  if (provider === 'soundcloud') {
    return { provider, sourceUrl: url.toString(), embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&auto_play=false&visual=true`, kind: url.pathname.includes('/sets/') ? 'collection' : 'track' }
  }
  return null
}
