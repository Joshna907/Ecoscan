import { useEffect, useRef, useState } from 'react'
export function CameraCapture({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let closed = false
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error()
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (closed) { media.getTracks().forEach((track) => track.stop()); return }
        stream.current = media
        if (video.current) video.current.srcObject = media
      } catch { if (!closed) setError('Camera access is unavailable. Allow camera permission, or close this and upload a photo.') }
    }
    void start()
    return () => { closed = true; stream.current?.getTracks().forEach((track) => track.stop()) }
  }, [])
  function capture() {
    const current = video.current
    if (!current?.videoWidth) return
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1600 / Math.max(current.videoWidth, current.videoHeight))
    canvas.width = Math.round(current.videoWidth * scale); canvas.height = Math.round(current.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(current, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) { setError('The photo could not be captured. Please try again.'); return }
      stream.current?.getTracks().forEach((track) => track.stop())
      onCapture(new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.85)
  }
  return <section className="camera" aria-label="Camera capture">
    <h3>Take a clothing photo</h3>
    {error ? <p role="alert">{error}</p> : <video ref={video} autoPlay playsInline muted onLoadedMetadata={() => setReady(true)} />}
    <div className="actions"><button type="button" onClick={capture} disabled={!ready || !!error}>Take photo</button><button type="button" className="secondary" onClick={onClose}>Close camera</button></div>
  </section>
}
