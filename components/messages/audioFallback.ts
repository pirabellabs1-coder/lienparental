'use client'

// Repli de lecture des notes vocales que le lecteur natif refuse : les notes enregistrées par Chrome
// (Android, ordinateur) avant le passage au MP4/AAC sont en WebM/Opus, que Safari sur iPhone ne lit pas
// dans un <audio>. On décode le fichier avec Web Audio (decodeAudioData) puis on le réécrit en WAV
// 16 bits mono 22,05 kHz, lisible partout. Tout se fait dans le navigateur ; rien n'est envoyé ailleurs.

const WAV_RATE = 22_050

/** Faut-il convertir avant lecture ? Vrai si le navigateur annonce ne pas lire ce format. */
export function needsFallback(mime: string | undefined): boolean {
  if (!mime || typeof document === 'undefined') return false
  const base = mime.split(';')[0]!.trim().toLowerCase()
  const probe = base === 'audio/webm' ? 'audio/webm; codecs="opus"' : base === 'audio/ogg' ? 'audio/ogg; codecs="opus"' : base
  return document.createElement('audio').canPlayType(probe) === ''
}

/** Échantillons [-1, 1] → fichier WAV PCM 16 bits mono. Module pur, exporté pour les tests. */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

type Ctor<T> = new (...args: never[]) => T

/** URL blob: d'une version WAV lisible du fichier, ou null si le navigateur ne sait pas le décoder. */
export async function toPlayableWav(src: string): Promise<string | null> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const data = await res.arrayBuffer()
    const w = window as unknown as {
      AudioContext?: Ctor<AudioContext>; webkitAudioContext?: Ctor<AudioContext>
      OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext
    }
    const Ctx = w.AudioContext ?? w.webkitAudioContext
    const Offline = w.OfflineAudioContext ?? w.webkitOfflineAudioContext
    if (!Ctx || !Offline) return null
    const ctx = new Ctx()
    let decoded: AudioBuffer
    try {
      // Forme à rappels : seule acceptée par les anciens Safari (la promesse n'y existe pas).
      decoded = await new Promise<AudioBuffer>((resolve, reject) => {
        const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined
        p?.then(resolve, reject)
      })
    } finally {
      void ctx.close().catch(() => {})
    }
    const off = new Offline(1, Math.max(1, Math.ceil(decoded.duration * WAV_RATE)), WAV_RATE)
    const source = off.createBufferSource()
    source.buffer = decoded
    source.connect(off.destination)
    source.start(0)
    const rendered = await off.startRendering()
    return URL.createObjectURL(encodeWav(rendered.getChannelData(0), WAV_RATE))
  } catch {
    return null
  }
}
