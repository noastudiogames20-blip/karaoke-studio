export type MusicProvider = 'youtube' | 'spotify' | 'deezer' | 'soundcloud'

export type ProviderDefinition = {
  id: MusicProvider
  name: string
  authUrl: string
  supportsPlaybackEmbed: boolean
  note: string
}

export const musicProviders: ProviderDefinition[] = [
  { id: 'youtube', name: 'YouTube', authUrl: 'https://www.youtube.com/', supportsPlaybackEmbed: true, note: 'YouTube IFrame API can provide embedded playback.' },
  { id: 'spotify', name: 'Spotify', authUrl: 'https://accounts.spotify.com/authorize', supportsPlaybackEmbed: true, note: 'Requires a Spotify developer client ID and OAuth redirect URI.' },
  { id: 'deezer', name: 'Deezer', authUrl: 'https://connect.deezer.com/oauth/auth.php', supportsPlaybackEmbed: true, note: 'Requires a Deezer application ID and OAuth redirect URI.' },
  { id: 'soundcloud', name: 'SoundCloud', authUrl: 'https://soundcloud.com/connect', supportsPlaybackEmbed: true, note: 'Requires an approved SoundCloud client and OAuth configuration.' },
]

export function openProviderLogin(provider: MusicProvider) {
  const definition = musicProviders.find((item) => item.id === provider)
  if (!definition) return
  window.open(definition.authUrl, '_blank', 'noopener,noreferrer')
}
