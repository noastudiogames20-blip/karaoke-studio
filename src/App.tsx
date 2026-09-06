import { useEffect, useRef, useState } from 'react'
import { AudioLines, ChevronDown, FileText, FolderOpen, Headphones, Library, ListMusic, Maximize2, Mic2, MoreHorizontal, Pause, Play, Plus, Radio, Search, Settings2, SkipBack, SkipForward, Sparkles, Square, Trophy, Upload, Volume2 } from 'lucide-react'
import './App.css'
import { musicProviders, openProviderLogin } from './services/providers'

type LyricLine = { time: number; text: string }
type RecentSession = { title: string; artist: string; date: string; score: number; cover: string }
type PlatformPlaylist = { name: string; owner: string; tracks: number; platform: string; color: string }

const demoLyrics: LyricLine[] = [
  { time: 0, text: 'The city wakes beneath the amber sky' },
  { time: 4, text: 'Every window holds a little light' },
  { time: 8, text: 'Take my hand, we are already flying' },
  { time: 12, text: 'Leave the quiet somewhere out of sight' },
]

const platformPlaylists: PlatformPlaylist[] = [
  { name: 'Night Drive', owner: 'Alex Laurent', tracks: 28, platform: 'Spotify', color: 'green' },
  { name: 'Les classiques du karaoké', owner: 'Alex Laurent', tracks: 42, platform: 'Deezer', color: 'orange' },
  { name: 'Live Sessions', owner: 'Alex Laurent', tracks: 16, platform: 'YouTube', color: 'red' },
  { name: 'Indie discoveries', owner: 'Alex Laurent', tracks: 31, platform: 'SoundCloud', color: 'black' },
]

function parseLrc(content: string): LyricLine[] {
  const lines: LyricLine[] = []
  const timestamp = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  for (const sourceLine of content.split(/\r?\n/)) {
    const matches = [...sourceLine.matchAll(timestamp)]
    const text = sourceLine.replace(timestamp, '').trim()
    for (const match of matches) {
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0')}`) : 0
      lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

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
  for (let lag = Math.floor(sampleRate / 600); lag <= Math.floor(sampleRate / 70); lag += 1) {
    let correlation = 0
    for (let index = 0; index < centered.length - lag; index += 1) correlation += centered[index] * centered[index + lag]
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestLag = lag
    }
  }
  return bestLag ? sampleRate / bestLag : null
}

function App() {
  const [activeNav, setActiveNav] = useState('Studio')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMicActive, setIsMicActive] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [pitchHz, setPitchHz] = useState<number | null>(null)
  const [volume, setVolume] = useState(0.85)
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('karaoke-recent-sessions') || 'null') || [
        { title: 'Midnight City', artist: 'M83', date: 'Today, 10:42', score: 84, cover: 'pink' },
        { title: 'Golden Hour', artist: 'JVKE', date: 'Yesterday, 21:18', score: 76, cover: 'yellow' },
        { title: 'Dreams', artist: 'Fleetwood Mac', date: 'Sep 04, 19:05', score: 91, cover: 'blue' },
      ]
    } catch { return [] }
  })
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(222)
  const [audioName, setAudioName] = useState('Midnight City')
  const [audioUrl, setAudioUrl] = useState('')
  const [lyrics, setLyrics] = useState<LyricLine[]>(demoLyrics)
  const [lyricsName, setLyricsName] = useState('Demo lyrics')
  const [statusMessage, setStatusMessage] = useState('Import a song and optional .lrc lyrics to begin.')
  const audioRef = useRef<HTMLAudioElement>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    void audioContextRef.current?.close()
  }, [audioUrl])

  const activeIndex = Math.max(0, lyrics.reduce((last, lyric, index) => lyric.time <= currentTime ? index : last, 0))
  const activeLyric = lyrics[activeIndex]?.text || 'Load synchronized lyrics to sing along.'
  const previousLyric = lyrics[activeIndex - 1]?.text || ''
  const nextLyric = lyrics[activeIndex + 1]?.text || ''

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
  }

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const bounds = event.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((event.clientX - bounds.left) / bounds.width) * duration
    setCurrentTime(audioRef.current.currentTime)
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    localStorage.setItem('karaoke-recent-sessions', JSON.stringify(recentSessions))
  }, [recentSessions])

  const finishSession = () => {
    setIsPlaying(false)
    if (!audioUrl) return
    const session: RecentSession = { title: audioName, artist: 'Local media', date: 'Just now', score: micLevel, cover: 'pink' }
    setRecentSessions((sessions) => [session, ...sessions.filter((item) => item.title !== audioName)].slice(0, 6))
  }

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audioUrl || !audio) {
      setStatusMessage('Choose a local audio or video file first.')
      return
    }
    if (audio.paused) {
      await audio.play()
      setIsPlaying(true)
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
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    const nextUrl = URL.createObjectURL(file)
    setAudioUrl(nextUrl)
    setAudioName(file.name.replace(/\.[^/.]+$/, ''))
    setCurrentTime(0)
    setStatusMessage(`${file.name} loaded. Press play when ready.`)
    window.setTimeout(() => audioRef.current?.load(), 0)
    void findAutomaticLyrics(file.name.replace(/\.[^/.]+$/, ''))
  }

  const findAutomaticLyrics = async (query: string) => {
    try {
      const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`)
      if (!response.ok) return
      const results = await response.json() as Array<{ syncedLyrics?: string; trackName?: string }>
      const match = results.find((result) => result.syncedLyrics)
      if (match?.syncedLyrics) {
        const parsedLyrics = parseLrc(match.syncedLyrics)
        if (parsedLyrics.length) {
          setLyrics(parsedLyrics)
          setLyricsName(`LRCLIB · ${match.trackName || query}`)
          setStatusMessage('Synchronized lyrics found automatically via LRCLIB.')
        }
      }
    } catch {
      setStatusMessage(`${query} loaded. Add an .lrc file if automatic lyrics are unavailable.`)
    }
  }

  const selectLyrics = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const parsedLyrics = parseLrc(await file.text())
    if (!parsedLyrics.length) {
      setStatusMessage('No timestamped lines found in this .lrc file.')
      return
    }
    setLyrics(parsedLyrics)
    setLyricsName(file.name)
    setStatusMessage(`${parsedLyrics.length} synchronized lyric lines loaded.`)
  }

  const toggleMic = async () => {
    if (isMicActive) {
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
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
      analyser.fftSize = 256
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
      <div className="provider-dock"><span>CONNECT SOURCE</span>{musicProviders.map((provider) => <button key={provider.id} onClick={() => openProviderLogin(provider.id)} title={provider.note}>{provider.name}</button>)}</div>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><AudioLines size={20} /></span><span>KARAOKE<br /><b>STUDIO</b></span></div>
        <div className="profile"><div className="avatar">AL</div><div><strong>Alex Laurent</strong><small>Level 12 <span>·</span> 2,480 XP</small></div><ChevronDown size={15} /></div>
        <nav>{['Studio', 'Bibliotheque', 'Playlists', 'Progression'].map((item) => <button key={item} className={activeNav === item ? 'active' : ''} onClick={() => setActiveNav(item)}>{item === 'Studio' ? <Radio size={18} /> : item === 'Bibliotheque' ? <Library size={18} /> : item === 'Playlists' ? <ListMusic size={18} /> : <Trophy size={18} />}{item}</button>)}</nav>
        <div className="sidebar-bottom"><button><Settings2 size={18} />Parametres</button><div className="version">Karaoke Studio <span>V10.0.0</span><div className="brand-credit">Noastudiogames <span>BY Groupes Studios</span><small>Open source software</small></div></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="breadcrumbs">{activeNav} <span>/</span> <strong>Session live</strong></div><div className="top-actions"><button className="icon-btn" aria-label="Search"><Search size={18} /></button><button className="icon-btn" aria-label="More"><MoreHorizontal size={18} /></button><button className="user-chip">AL</button></div></header>
        <div className="content">
          <div className="welcome-row"><div><p className="eyebrow">MARDI 06 SEPTEMBRE 2026</p><h1>Ready when you are, <em>Alex.</em></h1><p className="subhead">Your voice is an instrument. Let's make some noise.</p></div><label className="outline-btn"><Plus size={17} /> New session<input className="hidden-input" type="file" accept="audio/*,video/*" onChange={selectMedia} /></label></div>
          <div className={`dashboard-grid ${activeNav === 'Playlists' ? 'view-hidden' : ''}`}>
            <section className="stage-panel panel"><div className="stage-head"><div><span className="live-dot"></span> LIVE SESSION</div><span className="session-time">{formatTime(currentTime)} / {formatTime(duration)}</span></div><div className="stage"><div className="stage-glow"></div><div className="stage-copy"><span className="song-label">NOW PLAYING</span><h2>{audioName}</h2><p>{lyricsName} <span>·</span> {statusMessage}</p><div className="lyric-window"><span>{previousLyric}</span><strong>{activeLyric}</strong><span>{nextLyric}</span></div></div><div className="stage-badge"><Sparkles size={16} /> LIVE LYRICS</div></div><div className="progress-line" onClick={handleSeek} role="slider" aria-label="Seek playback" aria-valuenow={currentTime} aria-valuemin={0} aria-valuemax={duration} tabIndex={0}><span style={{ width: `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` }}></span></div><div className="player-controls"><button className="round-btn" onClick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button><div className="track-info"><strong>{audioName}</strong><small>{audioUrl ? 'Local media ready' : 'No media selected'}</small></div><label className="volume-control" aria-label="Volume"><Volume2 size={16} /><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label><label className="upload-btn"><Upload size={16} /> Import song<input type="file" accept="audio/*,video/*" onChange={selectMedia} /></label><label className="upload-btn"><FileText size={16} /> Import LRC<input type="file" accept=".lrc,text/plain" onChange={selectLyrics} /></label></div><audio ref={audioRef} src={audioUrl || undefined} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={finishSession} /></section>
            <section className="score-panel panel"><div className="panel-heading"><div><span className="eyebrow">YOUR PERFORMANCE</span><h3>Voice score</h3></div><button className="icon-btn" aria-label="Score options"><MoreHorizontal size={18} /></button></div><div className="score-ring" style={{ background: `conic-gradient(var(--lime-dark) 0 ${Math.max(8, micLevel)}%, #eeefeb ${Math.max(8, micLevel)}% 100%)` }}><div><strong>{micLevel}</strong><span>/100</span><small>{pitchHz ? `${Math.round(pitchHz)} Hz detected` : isMicActive ? 'Listening...' : 'Ready to sing'}</small></div></div><div className="score-meta"><div><span>Pitch</span><strong>{pitchHz ? `${Math.min(99, Math.round(72 + micLevel / 4))}%` : '--'}</strong></div><div><span>Rhythm</span><strong>--</strong></div><div><span>Stability</span><strong>{pitchHz ? `${Math.min(99, Math.round(65 + micLevel / 3))}%` : '--'}</strong></div></div><button className="text-btn">View full analysis <span>→</span></button></section>
            <section className="quick-panel panel"><div className="panel-heading"><div><span className="eyebrow">QUICK START</span><h3>Make it yours</h3></div><Headphones size={20} /></div><button className={`mic-card ${isMicActive ? 'connected' : ''}`} onClick={toggleMic}><span className="mic-icon"><Mic2 size={22} /></span><span><strong>{isMicActive ? 'Microphone active' : 'Connect microphone'}</strong><small>{isMicActive ? `Input level ${micLevel}%` : 'Required for live scoring'}</small></span><span className="status-pill">{isMicActive ? 'READY' : 'SET UP'}</span></button><div className="quick-links"><label><FolderOpen size={16} /> Browse library<input className="hidden-input" type="file" accept="audio/*,video/*" onChange={selectMedia} /></label><label><FileText size={16} /> Load synchronized lyrics<input className="hidden-input" type="file" accept=".lrc,text/plain" onChange={selectLyrics} /></label></div></section>
          </div>
          {activeNav === 'Playlists' && <section className="platform-playlists"><div className="section-title"><div><span className="eyebrow">CONNECTED SOURCES</span><h3>Platform playlists</h3></div><span className="source-count">{platformPlaylists.length} sources</span></div><p className="playlist-note">Your playlists stay grouped by provenance. Connect a platform to synchronize its latest changes.</p><div className="playlist-grid">{platformPlaylists.map((playlist) => <article className="playlist-card" key={playlist.name}><div className={`platform-badge ${playlist.color}`}>{playlist.platform.slice(0, 1)}</div><div className="playlist-info"><strong>{playlist.name}</strong><small>{playlist.tracks} tracks · {playlist.owner}</small><span className="provenance">Source: {playlist.platform}</span></div><button className="icon-btn" aria-label={`Open ${playlist.name}`}><Play size={16} /></button></article>)}</div></section>}
          <section className="lower-grid"><div className="section-title"><div><span className="eyebrow">KEEP GOING</span><h3>Recent sessions</h3></div><button className="text-btn">See all <span>→</span></button></div><div className="recent-list">{recentSessions.slice(0, 3).map((session) => <div className="recent-item" key={`${session.title}-${session.date}`}><div className={`cover cover-${session.cover}`}><AudioLines /></div><div><strong>{session.title}</strong><small>{session.artist} · {session.date}</small></div><div className="mini-score">{session.score} <span>/100</span></div><button className="icon-btn" aria-label={`Play ${session.title}`}><Play size={16} /></button></div>)}</div><div className="insight"><span className="insight-icon"><Sparkles size={17} /></span><div><strong>Live analysis enabled</strong><p>Sessions are saved locally on this device after playback ends.</p></div></div></section>
        </div>
      </section>
    </main>
  )
}

export default App
