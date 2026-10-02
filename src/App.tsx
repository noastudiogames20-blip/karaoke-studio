import { useEffect, useRef, useState } from 'react'
import { Activity, AudioLines, ChevronDown, Download, FileText, FolderOpen, Headphones, Library, ListMusic, Maximize2, Mic2, MoreHorizontal, Pause, Play, Plus, Radio, RefreshCw, Search, Settings2, SkipBack, SkipForward, Sparkles, Square, Trophy, Upload, Volume2, X } from 'lucide-react'
import './App.css'
import { musicProviders } from './services/providers'
import { createMusicEmbed, type EmbeddedMusic, type MusicProvider } from './services/music'
import { rankLrcLibMatches, searchLrcLib, type LrcLibTrack } from './services/lrclib'
import { APP_VERSION, RELEASES_URL, fetchLatestRelease, isNewerVersion, preferredAsset, type UpdateRelease } from './services/updates'
import { parseLrc, verifyLrc, type LyricLine } from './services/lrc'

type RecentSession = { title: string; artist: string; date: string; score: number; cover: string }
type PlatformPlaylist = { name: string; owner: string; platform: MusicProvider; color: string; url: string }
type LaunchState = 'idle' | 'countdown' | 'live'

const demoLyrics: LyricLine[] = [
  { time: 0, text: 'The city wakes beneath the amber sky' },
  { time: 4, text: 'Every window holds a little light' },
  { time: 8, text: 'Take my hand, we are already flying' },
  { time: 12, text: 'Leave the quiet somewhere out of sight' },
]

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return `${Math.floor(safeSeconds / 60).toString().padStart(2, '0')}:${Math.floor(safeSeconds % 60).toString().padStart(2, '0')}`
}

function detectPitch(samples: Uint8Array, sampleRate: number) {
  const centered = Array.from(samples, (sample) => sample - 128)
  const energy = centered.reduce((sum, sample) => sum + sample * sample, 0) / centered.length
  if (energy < 24) return null
  let bestLag = 0
  let bestCorrelation = 0
  const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(centered.length / 2))
  for (let lag = Math.floor(sampleRate / 600); lag <= maxLag; lag += 1) {
    let correlation = 0
    let leftEnergy = 0
    let rightEnergy = 0
    for (let index = 0; index < centered.length - lag; index += 1) {
      const left = centered[index]
      const right = centered[index + lag]
      correlation += left * right
      leftEnergy += left * left
      rightEnergy += right * right
    }
    correlation /= Math.sqrt(leftEnergy * rightEnergy) || 1
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestLag = lag
    }
  }
  return bestLag && bestCorrelation >= 0.55 ? sampleRate / bestLag : null
}

function playTone(frequency: number, duration = 0.12, type: OscillatorType = 'sine') {
  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + duration + 0.02)
  window.setTimeout(() => void context.close(), (duration + 0.1) * 1000)
}

type LrcVerificationPanelProps = {
  lines: LyricLine[]
  duration: number
  offsetSeconds: number
  onOffsetChange: (offset: number) => void
  onPreviewCue: (time: number) => void
}

function LrcVerificationPanel({ lines, duration, offsetSeconds, onOffsetChange, onPreviewCue }: LrcVerificationPanelProps) {
  const report = verifyLrc(lines, duration)
  return (
    <section className="lrc-verification panel">
      <div className="section-title">
        <div><span className="eyebrow">LYRIC TIMING CHECK</span><h3>Verify synchronization</h3></div>
        <span className={`lrc-status ${report.errors.length ? 'has-errors' : 'is-valid'}`}>{report.errors.length ? `${report.errors.length} issue(s)` : 'Timing ranges valid'}</span>
      </div>
      <p className="lrc-disclaimer">This checks timestamps against track length. It cannot transcribe lyrics from the recording; audition sample cues below to confirm the words align by ear.</p>
      <div className="lrc-summary"><span>{lines.length} timed lines</span><span>{formatTime(report.lastTimestamp)} last cue</span><span>{report.coveragePercent}% track covered</span><span>Offset {offsetSeconds >= 0 ? '+' : ''}{offsetSeconds.toFixed(2)}s</span></div>
      <div className="lrc-offset-controls"><span>Fine-tune sync</span><button onClick={() => onOffsetChange(offsetSeconds - 0.25)}>-0.25s</button><button onClick={() => onOffsetChange(offsetSeconds + 0.25)}>+0.25s</button><button onClick={() => onOffsetChange(0)}>Reset</button></div>
      {report.errors.length > 0 && <ul className="lrc-issues errors">{report.errors.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      {report.warnings.length > 0 && <ul className="lrc-issues">{report.warnings.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      {report.errors.length === 0 && report.warnings.length === 0 && <p className="lrc-clean">No timestamp range or gap issues detected.</p>}
      <div className="lrc-cue-list">{lines.slice(0, 12).map((line, index) => <button key={`${line.time}-${index}`} onClick={() => onPreviewCue(Math.max(0, Math.min(duration, line.time + offsetSeconds)))}><span>{formatTime(line.time)}</span><strong>{line.text || '(instrumental cue)'}</strong><Play size={13} /></button>)}</div>
    </section>
  )
}

function App() {
  const [activeNav, setActiveNav] = useState('Studio')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMicActive, setIsMicActive] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [pitchHz, setPitchHz] = useState<number | null>(null)
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [countdown, setCountdown] = useState(3)
  const [volume, setVolume] = useState(0.85)
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('karaoke-recent-sessions') || '[]') as RecentSession[]
    } catch { return [] }
  })
  const [platformPlaylists, setPlatformPlaylists] = useState<PlatformPlaylist[]>(() => {
    try { return JSON.parse(localStorage.getItem('karaoke-platform-playlists') || '[]') as PlatformPlaylist[] } catch { return [] }
  })
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioName, setAudioName] = useState('Midnight City')
  const [audioUrl, setAudioUrl] = useState('')
  const [lyrics, setLyrics] = useState<LyricLine[]>(demoLyrics)
  const [lyricsName, setLyricsName] = useState('Demo lyrics')
  const [lyricOffsetSeconds, setLyricOffsetSeconds] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Import a song and optional .lrc lyrics to begin.')
  const [selectedMusicProvider, setSelectedMusicProvider] = useState<MusicProvider | null>(null)
  const [musicSourceUrl, setMusicSourceUrl] = useState('')
  const [embeddedMusic, setEmbeddedMusic] = useState<EmbeddedMusic | null>(null)
  const [musicSourceError, setMusicSourceError] = useState('')
  const [lyricSearchTitle, setLyricSearchTitle] = useState('')
  const [lyricSearchArtist, setLyricSearchArtist] = useState('')
  const [lyricSearchResults, setLyricSearchResults] = useState<LrcLibTrack[]>([])
  const [lyricSearchBusy, setLyricSearchBusy] = useState(false)
  const [lyricSearchMessage, setLyricSearchMessage] = useState('')
  const [latestRelease, setLatestRelease] = useState<UpdateRelease | null>(null)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(true)
  const [updateError, setUpdateError] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)

  const checkForUpdates = async () => {
    setUpdateChecking(true)
    setUpdateError('')
    try {
      const release = await fetchLatestRelease()
      setLatestRelease(isNewerVersion(release.tag_name) ? release : null)
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Update check unavailable')
    } finally {
      setUpdateChecking(false)
    }
  }

  // Startup network synchronization intentionally updates the release state.
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void checkForUpdates() }, [])

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    void audioContextRef.current?.close()
  }, [audioUrl])

  const activeIndex = Math.max(0, lyrics.reduce((last, lyric, index) => lyric.time <= currentTime - lyricOffsetSeconds ? index : last, 0))
  const activeLyric = lyrics[activeIndex]?.text || 'Load synchronized lyrics to sing along.'
  const previousLyric = lyrics[activeIndex - 1]?.text || ''
  const nextLyric = lyrics[activeIndex + 1]?.text || ''
  const hasImportedLyrics = lyricsName !== 'Demo lyrics'

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
  }

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const bounds = event.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((event.clientX - bounds.left) / bounds.width) * duration
    setCurrentTime(audioRef.current.currentTime)
  }

  const previewLyricCue = (time: number) => {
    if (!audioRef.current || !audioUrl) {
      setStatusMessage('Load a media track before auditioning lyric cues.')
      return
    }
    audioRef.current.currentTime = time
    setCurrentTime(time)
    void audioRef.current.play()
    setIsPlaying(true)
  }

  const connectMusicSource = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedMusicProvider) return
    const result = createMusicEmbed(selectedMusicProvider, musicSourceUrl)
    if (!result) {
      setMusicSourceError(`Enter a valid public ${selectedMusicProvider} track, album, or playlist URL.`)
      setEmbeddedMusic(null)
      return
    }
    setMusicSourceError('')
    setEmbeddedMusic(result)
    if (result.kind === 'collection') {
      const label = new URL(result.sourceUrl).pathname.split('/').filter(Boolean).at(-1) || 'Shared playlist'
      const colors: Record<MusicProvider, string> = { spotify: 'green', deezer: 'orange', youtube: 'red', soundcloud: 'black' }
      setPlatformPlaylists((items) => [{ name: decodeURIComponent(label), owner: 'Public shared link', platform: result.provider, color: colors[result.provider], url: result.sourceUrl }, ...items.filter((item) => item.url !== result.sourceUrl)].slice(0, 20))
    }
  }

  const searchOnlineLyrics = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setLyricSearchBusy(true)
    setLyricSearchMessage('Searching LRCLIB...')
    try {
      const results = await searchLrcLib(lyricSearchTitle, lyricSearchArtist)
      const mediaDuration = audioRef.current?.duration || duration
      setLyricSearchResults(rankLrcLibMatches(results, mediaDuration))
      setLyricSearchMessage(results.length ? `${results.length} LRCLIB match(es). Select a synchronized result.` : 'No LRCLIB matches found.')
    } catch (error) {
      setLyricSearchResults([])
      setLyricSearchMessage(error instanceof Error ? error.message : 'LRCLIB is unavailable. Try a local .lrc file.')
    } finally {
      setLyricSearchBusy(false)
    }
  }

  const selectLrcLibTrack = (track: LrcLibTrack) => {
    if (!track.syncedLyrics) {
      setLyricSearchMessage('This result has plain text only; choose one with synchronized lyrics or load an .lrc file.')
      return
    }
    const parsed = parseLrc(track.syncedLyrics)
    if (!parsed.lines.length) {
      setLyricSearchMessage('The LRCLIB result contained no valid synchronized timestamps.')
      return
    }
    setLyrics(parsed.lines)
    setLyricOffsetSeconds(parsed.metadata.offsetMs / 1000)
    setLyricsName(`LRCLIB · ${track.trackName}`)
    setLyricSearchMessage(`Loaded ${parsed.lines.length} timed lines. Compare the track duration and audition the cues below.`)
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    localStorage.setItem('karaoke-recent-sessions', JSON.stringify(recentSessions))
  }, [recentSessions])

  useEffect(() => {
    localStorage.setItem('karaoke-platform-playlists', JSON.stringify(platformPlaylists))
  }, [platformPlaylists])

  const finishSession = () => {
    setIsPlaying(false)
    if (!audioUrl) return
    const session: RecentSession = { title: audioName, artist: 'Local media', date: 'Just now', score: micLevel, cover: 'pink' }
    setRecentSessions((sessions) => [session, ...sessions.filter((item) => item.title !== audioName)].slice(0, 6))
  }

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (launchState === 'countdown') return
    if (!audioUrl || !audio) {
      setStatusMessage('Choose a local audio or video file first.')
      return
    }
    if (audio.paused) {
      setLaunchState('countdown')
      for (let value = 3; value > 0; value -= 1) {
        setCountdown(value)
        playTone(value === 1 ? 660 : 440, 0.16, value === 1 ? 'triangle' : 'sine')
        await new Promise((resolve) => window.setTimeout(resolve, 600))
      }
      playTone(880, 0.3, 'triangle')
      await audio.play()
      setIsPlaying(true)
      setLaunchState('live')
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }

  const restartPlayback = () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = 0
    setCurrentTime(0)
  }

  const stopPlayback = () => {
    audioRef.current?.pause()
    restartPlayback()
    setIsPlaying(false)
    setLaunchState('idle')
  }

  const seekBy = (seconds: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds))
    setCurrentTime(audioRef.current.currentTime)
  }

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.()
    else await document.exitFullscreen?.()
  }

  const selectMedia = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.type.startsWith('video/')) {
      setStatusMessage('Video playback is not supported yet. Choose an audio file instead.')
      event.target.value = ''
      return
    }
    if (file.type.startsWith('video/')) {
      setStatusMessage('Video playback is not supported yet. Select an audio file (MP3, WAV, FLAC, OGG, AAC, or M4A).')
      event.target.value = ''
      return
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    const nextUrl = URL.createObjectURL(file)
    setAudioUrl(nextUrl)
    setAudioName(file.name.replace(/\.[^/.]+$/, ''))
    setLyricSearchTitle(file.name.replace(/\.[^/.]+$/, ''))
    setCurrentTime(0)
    setStatusMessage(`${file.name} loaded. Press play when ready.`)
    window.setTimeout(() => audioRef.current?.load(), 0)
    void findAutomaticLyrics(file.name.replace(/\.[^/.]+$/, ''))
  }

  const findAutomaticLyrics = async (query: string) => {
    try {
      setLyricSearchTitle(query)
      const results = await searchLrcLib(query, lyricSearchArtist)
      setLyricSearchResults(rankLrcLibMatches(results, audioRef.current?.duration || duration))
      setLyricSearchMessage(results.length ? 'Matches found. Check artist and duration, then choose the correct version.' : 'No result found; try adding the artist name or load a local .lrc file.')
    } catch {
      setLyricSearchMessage('Automatic LRCLIB search failed. Check your connection or load a local .lrc file.')
    }
  }

  const selectLyrics = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const parsed = parseLrc(await file.text())
    if (!parsed.lines.length) {
      setStatusMessage('No valid timestamped lines found in this .lrc file.')
      return
    }
    setLyrics(parsed.lines)
    setLyricOffsetSeconds(parsed.metadata.offsetMs / 1000)
    setLyricsName(file.name)
    setStatusMessage(`${parsed.lines.length} synchronized lyric lines loaded.${parsed.warnings.length ? ` ${parsed.warnings.join(' ')}` : ''}`)
  }

  const toggleMic = async () => {
    if (isMicActive) {
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      animationRef.current = null
      void audioContextRef.current?.close()
      audioContextRef.current = null
      setIsMicActive(false)
      setMicLevel(0)
      setPitchHz(null)
      return
    }
    if (!navigator.mediaDevices) {
      setStatusMessage('Microphone access is not available in this context.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      context.createMediaStreamSource(stream).connect(analyser)
      micStreamRef.current = stream
      audioContextRef.current = context
      analyserRef.current = analyser
      setIsMicActive(true)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const updateMeter = () => {
        analyser.getByteTimeDomainData(data)
        const rms = Math.sqrt(data.reduce((sum, value) => sum + (value - 128) ** 2, 0) / data.length)
        setMicLevel(Math.min(100, Math.round(rms * 3.2)))
        setPitchHz(detectPitch(data, context.sampleRate))
        animationRef.current = requestAnimationFrame(updateMeter)
      }
      updateMeter()
    } catch {
      setStatusMessage('Microphone permission was denied or the device is unavailable.')
    }
  }

  return (
    <main className="app-shell">
      <div className="global-transport"><button onClick={() => seekBy(-5)} aria-label="Back five seconds"><SkipBack size={15} /></button><button onClick={() => void togglePlayback()} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}</button><button onClick={stopPlayback} aria-label="Stop"><Square size={14} fill="currentColor" /></button><button onClick={() => seekBy(5)} aria-label="Forward five seconds"><SkipForward size={15} /></button><button onClick={toggleFullscreen} aria-label="Fullscreen"><Maximize2 size={15} /></button></div>
      <div className="provider-dock"><span>PLAY FROM</span>{musicProviders.map((provider) => <button key={provider.id} className={selectedMusicProvider === provider.id ? 'selected' : ''} onClick={() => { setSelectedMusicProvider(provider.id); setMusicSourceError('') }} title={provider.note}>{provider.name}</button>)}</div>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><AudioLines size={20} /></span><span>KARAOKE<br /><b>STUDIO</b></span></div>
        <div className="profile"><div className="avatar">AL</div><div><strong>Alex Laurent</strong><small>Level 12 <span>·</span> 2,480 XP</small></div><ChevronDown size={15} /></div>
        <nav>{['Studio', 'Bibliotheque', 'Playlists', 'Progression'].map((item) => <button key={item} className={activeNav === item ? 'active' : ''} onClick={() => setActiveNav(item)}>{item === 'Studio' ? <Radio size={18} /> : item === 'Bibliotheque' ? <Library size={18} /> : item === 'Playlists' ? <ListMusic size={18} /> : <Trophy size={18} />}{item}</button>)}</nav>
        <div className="sidebar-bottom"><button><Settings2 size={18} />Parametres</button><div className="version">Karaoke Studio <span>V10.0.0 BETA</span><div className="brand-credit">Noastudiogames <span>BY Groupes Studios</span><small>Open source software · Beta</small></div></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="breadcrumbs">{activeNav} <span>/</span> <strong>Session live</strong></div><div className="top-actions"><button className="icon-btn" aria-label="Search"><Search size={18} /></button><button className="icon-btn" aria-label="More"><MoreHorizontal size={18} /></button><button className="user-chip">AL</button></div></header>
        <div className="content">
          {selectedMusicProvider && <section className="source-connect panel"><div><span className="eyebrow">OFFICIAL PLAYER</span><h3>Play from {musicProviders.find((provider) => provider.id === selectedMusicProvider)?.name}</h3><p>Paste a public share URL. Playback uses the provider’s own embedded player and its own sign-in rules; private account playlists are not synced.</p></div><form onSubmit={connectMusicSource}><input type="url" value={musicSourceUrl} onChange={(event) => setMusicSourceUrl(event.target.value)} placeholder="Paste a public track, album, or playlist URL" required /><button className="update-button" type="submit">Load player</button></form>{musicSourceError && <p className="source-error">{musicSourceError}</p>}</section>}
          {embeddedMusic && <section className="embedded-player panel"><div className="section-title"><div><span className="eyebrow">{embeddedMusic.provider.toUpperCase()} PLAYER</span><h3>Official playback</h3></div><button className="text-btn" onClick={() => setEmbeddedMusic(null)}>Close player</button></div><iframe src={embeddedMusic.embedUrl} title={`${embeddedMusic.provider} music player`} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /><p>Use the controls inside the service player. Media availability and login are managed by the music provider.</p></section>}
          <section className="lrclib-search panel"><div className="section-title"><div><span className="eyebrow">ONLINE LYRICS</span><h3>Search LRCLIB</h3></div><span className="source-count">Synced + plain lyrics</span></div><form onSubmit={(event) => void searchOnlineLyrics(event)}><input value={lyricSearchTitle} onChange={(event) => setLyricSearchTitle(event.target.value)} placeholder="Song title" aria-label="Song title" /><input value={lyricSearchArtist} onChange={(event) => setLyricSearchArtist(event.target.value)} placeholder="Artist (optional)" aria-label="Artist" /><button className="update-button" type="submit" disabled={lyricSearchBusy}>{lyricSearchBusy ? 'Searching...' : 'Search lyrics'}</button></form>{lyricSearchMessage && <p className="lrclib-message">{lyricSearchMessage}</p>}{lyricSearchResults.length > 0 && <div className="lrclib-results">{lyricSearchResults.map((track) => <article className="lrclib-result" key={track.id}><div><strong>{track.trackName}</strong><small>{track.artistName}{track.albumName ? ` · ${track.albumName}` : ''} · {formatTime(track.duration)}</small></div><span className={track.syncedLyrics ? 'synced-label' : 'plain-label'}>{track.syncedLyrics ? 'Synced' : track.plainLyrics ? 'Plain text' : 'No lyrics'}</span><button disabled={!track.syncedLyrics} onClick={() => selectLrcLibTrack(track)}>{track.syncedLyrics ? 'Use lyrics' : 'Unavailable'}</button></article>)}</div>}</section>
          {hasImportedLyrics && <LrcVerificationPanel lines={lyrics} duration={duration} offsetSeconds={lyricOffsetSeconds} onOffsetChange={setLyricOffsetSeconds} onPreviewCue={previewLyricCue} />}
          {launchState === 'countdown' && <div className="countdown-banner"><span>GET READY</span><strong>{countdown}</strong><small>Starting your karaoke session</small></div>}
          {latestRelease && <section className="update-banner"><div className="update-icon"><Download size={18} /></div><div><strong>New version available: {latestRelease.tag_name}</strong><p>Karaoke Studio {APP_VERSION} is outdated. Read the release notes and download the update for this device.</p></div><button className="update-button" onClick={() => setUpdateOpen(true)}>View update</button><button className="update-dismiss" onClick={() => setLatestRelease(null)} aria-label="Dismiss update"><X size={16} /></button></section>}
          <div className="welcome-row"><div><p className="eyebrow">MARDI 06 SEPTEMBRE 2026</p><h1>Ready when you are, <em>Alex.</em></h1><p className="subhead">Your voice is an instrument. Let's make some noise.</p></div><label className="outline-btn"><Plus size={17} /> New session<input className="hidden-input" type="file" accept="audio/*,video/*" onChange={selectMedia} /></label></div>
          <div className={`dashboard-grid ${activeNav === 'Playlists' ? 'view-hidden' : ''}`}>
            <section className="stage-panel panel"><div className="stage-head"><div><span className="live-dot"></span> LIVE SESSION</div><span className="session-time">{formatTime(currentTime)} / {formatTime(duration)}</span></div><div className="stage"><div className="stage-glow"></div><div className="stage-copy"><span className="song-label">NOW PLAYING</span><h2>{audioName}</h2><p>{lyricsName} <span>·</span> {statusMessage}</p><div className="lyric-window"><span>{previousLyric}</span><strong>{activeLyric}</strong><span>{nextLyric}</span></div></div><div className="stage-badge"><Sparkles size={16} /> LIVE LYRICS</div></div><div className="progress-line" onClick={handleSeek} role="slider" aria-label="Seek playback" aria-valuenow={currentTime} aria-valuemin={0} aria-valuemax={duration} tabIndex={0}><span style={{ width: `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` }}></span></div><div className="player-controls"><button className="round-btn" onClick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button><div className="track-info"><strong>{audioName}</strong><small>{audioUrl ? 'Local media ready' : 'No media selected'}</small></div><label className="volume-control" aria-label="Volume"><Volume2 size={16} /><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label><label className="upload-btn"><Upload size={16} /> Import song<input type="file" accept="audio/*,video/*" onChange={selectMedia} /></label><label className="upload-btn"><FileText size={16} /> Import LRC<input type="file" accept=".lrc,text/plain" onChange={selectLyrics} /></label></div><audio ref={audioRef} src={audioUrl || undefined} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={finishSession} /></section>
            <section className="score-panel panel"><div className="panel-heading"><div><span className="eyebrow">LIVE MICROPHONE</span><h3>Input analysis</h3></div><Activity size={18} /></div><div className="score-ring" style={{ background: `conic-gradient(var(--lime-dark) 0 ${Math.max(8, micLevel)}%, #eeefeb ${Math.max(8, micLevel)}% 100%)` }}><div><strong>{micLevel}</strong><span>/100 level</span><small>{pitchHz ? `${Math.round(pitchHz)} Hz` : isMicActive ? 'Listening...' : 'Microphone off'}</small></div></div><div className="score-meta"><div><span>Input level</span><strong>{isMicActive ? `${micLevel}%` : '--'}</strong></div><div><span>Pitch</span><strong>{pitchHz ? `${Math.round(pitchHz)} Hz` : '--'}</strong></div><div><span>Rhythm</span><strong>Needs note chart</strong></div></div><p className="analysis-note">No vocal accuracy score is shown until timed note charts are available.</p></section>
            <section className="quick-panel panel"><div className="panel-heading"><div><span className="eyebrow">QUICK START</span><h3>Make it yours</h3></div><Headphones size={20} /></div><button className={`mic-card ${isMicActive ? 'connected' : ''}`} onClick={toggleMic}><span className="mic-icon"><Mic2 size={22} /></span><span><strong>{isMicActive ? 'Microphone active' : 'Connect microphone'}</strong><small>{isMicActive ? `Input level ${micLevel}%` : 'Required for live scoring'}</small></span><span className="status-pill">{isMicActive ? 'READY' : 'SET UP'}</span></button><div className="quick-links"><label><FolderOpen size={16} /> Browse library<input className="hidden-input" type="file" accept="audio/*,video/*" onChange={selectMedia} /></label><label><FileText size={16} /> Load synchronized lyrics<input className="hidden-input" type="file" accept=".lrc,text/plain" onChange={selectLyrics} /></label></div></section>
          </div>
          {activeNav === 'Playlists' && <section className="platform-playlists"><div className="section-title"><div><span className="eyebrow">SAVED SHARED LINKS</span><h3>Platform playlists</h3></div><span className="source-count">{platformPlaylists.length} saved</span></div><p className="playlist-note">Public playlist links are saved on this device. Private account libraries require each provider’s OAuth app credentials and are not synced here.</p>{platformPlaylists.length ? <div className="playlist-grid">{platformPlaylists.map((playlist) => <article className="playlist-card" key={playlist.url}><div className={`platform-badge ${playlist.color}`}>{playlist.platform.slice(0, 1)}</div><div className="playlist-info"><strong>{playlist.name}</strong><small>{playlist.owner}</small><span className="provenance">Source: {playlist.platform}</span></div><button className="icon-btn" onClick={() => { const embed = createMusicEmbed(playlist.platform, playlist.url); if (embed) setEmbeddedMusic(embed) }} aria-label={`Play ${playlist.name}`}><Play size={16} /></button></article>)}</div> : <p className="playlist-empty">No shared playlists saved yet. Choose a service below, paste a public playlist URL, and load it.</p>}</section>}
          <section className="lower-grid"><div className="section-title"><div><span className="eyebrow">KEEP GOING</span><h3>Recent sessions</h3></div><button className="text-btn">See all <span>→</span></button></div><div className="recent-list">{recentSessions.slice(0, 3).map((session) => <div className="recent-item" key={`${session.title}-${session.date}`}><div className={`cover cover-${session.cover}`}><AudioLines /></div><div><strong>{session.title}</strong><small>{session.artist} · {session.date}</small></div><div className="mini-score">{session.score} <span>/100</span></div><button className="icon-btn" aria-label={`Play ${session.title}`}><Play size={16} /></button></div>)}</div><div className="insight"><span className="insight-icon"><Sparkles size={17} /></span><div><strong>Live analysis enabled</strong><p>Sessions are saved locally on this device after playback ends.</p></div></div></section>
        </div>
      </section>
      <button className="update-status" onClick={() => { setUpdateOpen(true); void checkForUpdates() }} title="Check for updates"><RefreshCw size={14} /> {updateChecking ? 'Checking...' : latestRelease ? 'Update available' : `Check updates · ${APP_VERSION}`}</button>
      {updateOpen && <div className="update-modal-backdrop" onClick={() => setUpdateOpen(false)}><section className="update-modal" onClick={(event) => event.stopPropagation()}><div className="update-modal-head"><div><span className="eyebrow">SOFTWARE UPDATE</span><h2>{updateChecking ? 'Checking for updates…' : latestRelease ? latestRelease.name || latestRelease.tag_name : 'You are up to date'}</h2></div><button className="icon-btn" onClick={() => setUpdateOpen(false)} aria-label="Close"><X size={18} /></button></div>{latestRelease ? <><p className="update-version">Installed {APP_VERSION} · Available {latestRelease.tag_name}</p><div className="release-notes"><strong>Release notes</strong><pre>{latestRelease.body || 'No release notes were provided.'}</pre></div><div className="update-modal-actions"><a className="update-button" href={preferredAsset(latestRelease.assets)?.browser_download_url || latestRelease.html_url} target="_blank" rel="noreferrer"><Download size={16} /> Download update</a><a className="text-btn" href={latestRelease.html_url} target="_blank" rel="noreferrer">Open release page <span>→</span></a></div><small className="update-help">Close the software before installing the Windows, macOS or Linux package. Android updates install through the APK package manager.</small></> : <><p className="update-version">Installed version {APP_VERSION}</p>{updateChecking ? <p className="update-copy">Checking the public GitHub Beta releases…</p> : updateError ? <p className="update-copy">{updateError}</p> : <p className="update-copy">No newer public release was found.</p>}<button className="update-button" onClick={() => void checkForUpdates()} disabled={updateChecking}><RefreshCw size={16} /> {updateChecking ? 'Checking…' : 'Check again'}</button><a className="text-btn" href={RELEASES_URL} target="_blank" rel="noreferrer">View all releases <span>→</span></a></>}</section></div>}
    </main>
  )
}

export default App
