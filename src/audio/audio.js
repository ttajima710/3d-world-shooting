// ===========================================================================
// Audio: short MP3 SFX (multi-instance) and tiny WebAudio beeps.
// Ported from arwing_react/src/audio/audio.js (simplified — no BGM/boss).
// Files live in /public/audio (served at ./audio/*).
// ===========================================================================

const SFX_SRC = {
  laser: './audio/laser.mp3',
  bomb: './audio/bomb.mp3',
  roll: './audio/roll.mp3',
  enemy: './audio/enemy.mp3', // 敵撃破
}

let actx = null
const _sndLast = {}
const _sfxBuffers = {}   // name -> decoded AudioBuffer (Web Audio, reused per shot)
let _sfxLoading = false

function ensureCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)()
  return actx
}

// Decode every SFX once into an AudioBuffer. Playing then costs a cheap
// BufferSource instead of `new Audio()` per shot (the old way janked rapid fire
// on mobile, where creating/playing an HTMLAudioElement each shot is expensive).
function preloadSfx() {
  if (_sfxLoading || !actx) return
  _sfxLoading = true
  for (const name in SFX_SRC) {
    fetch(SFX_SRC[name])
      .then((r) => r.arrayBuffer())
      .then((buf) => actx.decodeAudioData(buf))
      .then((decoded) => { _sfxBuffers[name] = decoded })
      .catch(() => {})
  }
}

export function beep(freq, dur, type = 'sine', vol = 0.2) {
  try {
    ensureCtx()
    const o = actx.createOscillator()
    const g = actx.createGain()
    o.type = type || 'sine'
    o.frequency.value = freq
    g.gain.value = vol || 0.08
    o.connect(g); g.connect(actx.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur)
    o.stop(actx.currentTime + dur)
  } catch (e) { /* ignore */ }
}

export function resumeAudio() {
  try { ensureCtx(); preloadSfx(); if (actx) actx.resume() } catch (e) { /* ignore */ }
}

export function playSnd(name, vol = 1, minGap = 0.05) {
  try {
    const src = SFX_SRC[name]
    if (!src) return
    if (minGap) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
      if (_sndLast[name] && now - _sndLast[name] < minGap) return
      _sndLast[name] = now
    }
    const buf = _sfxBuffers[name]
    if (buf && actx) {
      // cheap, GC-friendly playback via Web Audio
      const s = actx.createBufferSource()
      s.buffer = buf
      const g = actx.createGain()
      g.gain.value = vol == null ? 0.6 : vol
      s.connect(g); g.connect(actx.destination)
      s.start()
    } else {
      // buffer not decoded yet (first moments) — one-shot fallback
      const a = new Audio(src)
      a.volume = vol == null ? 0.6 : vol
      a.play().catch(() => {})
    }
  } catch (e) { /* ignore */ }
}
