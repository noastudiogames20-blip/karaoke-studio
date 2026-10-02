export type MusicProvider = 'youtube' | 'spotify' | 'deezer' | 'soundcloud'

export type ProviderDefinition = {
  id: MusicProvider
  name: string
  supportsPlaybackEmbed: boolean
  note: string
}

export const musicProviders: ProviderDefinition[] = [
  { id: 'youtube', name: 'YouTube', supportsPlaybackEmbed: true, note: 'Official YouTube embedded player; paste a public video URL.' },
  { id: 'spotify', name: 'Spotify', supportsPlaybackEmbed: true, note: 'Official Spotify embed; paste a public track, album, or playlist URL.' },
  { id: 'deezer', name: 'Deezer', supportsPlaybackEmbed: true, note: 'Official Deezer widget; paste a public track, album, or playlist URL.' },
  { id: 'soundcloud', name: 'SoundCloud', supportsPlaybackEmbed: true, note: 'Official SoundCloud widget; paste a public track or playlist URL.' },
]
