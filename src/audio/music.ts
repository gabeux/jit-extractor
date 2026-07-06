// Streams music from public/music/ based on manifest.json (a JSON array of
// file names). Drop MP3s in the folder and list them there.
// M toggles · N next track · B previous track.
export class MusicPlayer {
  private tracks: string[] = []
  private index = 0
  private audio: HTMLAudioElement | null = null
  private started = false
  enabled = true
  // "NOW PLAYING" credit: set when a track starts, faded out by the game loop
  creditTitle = ''
  creditT = 0
  // big files take a while: always keep the upcoming track warming up
  private preloadEl: HTMLAudioElement | null = null
  private preloadIdx = -1

  constructor() {
    fetch('music/manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (Array.isArray(list)) this.tracks = list.filter((t) => typeof t === 'string')
        if (this.tracks.length === 0) return
        // start buffering the first track immediately (playing needs a
        // gesture, downloading doesn't)
        this.warm(0)
        // the first user gesture may have happened before the manifest
        // arrived — start playback now instead of silently doing nothing
        if (this.started && this.enabled && !this.audio) this.playCurrent()
      })
      .catch(() => { /* silent: no music folder is fine */ })
  }

  private makeAudio(i: number): HTMLAudioElement {
    const a = new Audio(`music/${this.tracks[i]}`)
    a.preload = 'auto'
    a.volume = 0.4
    return a
  }

  private warm(i: number) {
    this.preloadIdx = i
    this.preloadEl = this.makeAudio(i)
  }

  /** Call after the first user gesture (browser autoplay policy). */
  start() {
    if (this.started) return
    this.started = true
    this.playCurrent()
  }

  private playCurrent() {
    if (!this.enabled || this.tracks.length === 0) return
    this.audio?.pause()
    this.creditTitle = this.tracks[this.index].replace(/\.[^.]+$/, '')
    this.creditT = 6.5
    // use the pre-buffered element when it matches, else start cold
    this.audio = this.preloadIdx === this.index && this.preloadEl ? this.preloadEl : this.makeAudio(this.index)
    this.preloadEl = null
    this.preloadIdx = -1
    this.audio.currentTime = 0
    this.audio.addEventListener('ended', () => {
      this.index = (this.index + 1) % this.tracks.length
      this.playCurrent()
    })
    void this.audio.play().catch(() => { /* ignored: file missing or blocked */ })
    if (this.tracks.length > 1) this.warm((this.index + 1) % this.tracks.length)
  }

  next() {
    if (this.tracks.length === 0) return
    this.index = (this.index + 1) % this.tracks.length
    if (this.enabled) this.playCurrent()
  }

  prev() {
    if (this.tracks.length === 0) return
    this.index = (this.index - 1 + this.tracks.length) % this.tracks.length
    if (this.enabled) this.playCurrent()
  }

  toggle() {
    this.enabled = !this.enabled
    if (this.enabled) {
      if (this.audio) {
        void this.audio.play().catch(() => {})
        if (this.creditTitle) this.creditT = 6.5 // re-roll the credit
      } else this.playCurrent()
    } else {
      this.audio?.pause()
      this.creditT = 0
    }
  }
}
