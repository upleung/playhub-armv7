import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import Hls from 'hls.js'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'

const PlyrPlayer = forwardRef(({ url, poster, onTimeUpdate, onError, onReady, style }, ref) => {
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const hlsRef = useRef(null)

  // Expose video element to parent
  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
    seekTo: (time) => {
      const video = videoRef.current
      if (video && time > 0) {
        if (video.readyState >= 2 && video.duration > 0) {
          video.currentTime = Math.min(time, video.duration - 1)
        } else {
          const onCanPlay = () => {
            video.currentTime = Math.min(time, video.duration - 1 || time)
            video.removeEventListener('canplay', onCanPlay)
          }
          video.addEventListener('canplay', onCanPlay)
          setTimeout(() => {
            video.currentTime = time
            video.removeEventListener('canplay', onCanPlay)
          }, 3000)
        }
      }
    },
  }))

  useEffect(() => {
    if (!url || !videoRef.current) return
    const video = videoRef.current

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null }

    const isHls = url.includes('.m3u8')
    let destroyed = false
    let errorCount = 0

    const handleError = (msg) => {
      if (!destroyed) {
        errorCount++
        if (errorCount <= 3) onError?.(msg || '播放出错')
      }
    }

    const initPlayer = () => {
      if (destroyed || playerRef.current) return
      try {
        playerRef.current = new Plyr(video, {
          controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
          settings: ['speed'],
          speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
          ratio: '16:9',
          tooltips: { controls: true, seek: true },
          keyboard: { focused: true, global: false },
        })
        onReady?.()
      } catch {}
    }

    video.addEventListener('error', () => handleError('视频加载失败'))
    video.addEventListener('loadedmetadata', initPlayer)

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90 })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { initPlayer(); video.play().catch(() => {}) })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()
            setTimeout(() => { if (!destroyed && video.readyState < 2) handleError('网络加载失败') }, 8000)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
          } else {
            handleError('播放出错')
          }
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
    } else {
      video.src = url
    }

    const onTime = () => { if (video.currentTime > 0) onTimeUpdate?.(video.currentTime, video.duration || 0) }
    video.addEventListener('timeupdate', onTime)

    return () => {
      destroyed = true
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('error', () => {})
      video.removeEventListener('loadedmetadata', initPlayer)
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null }
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [url])

  return (
    <div style={{ width: '100%', background: '#000', borderRadius: 12, overflow: 'hidden', ...style }}>
      <video ref={videoRef} poster={poster} style={{ width: '100%', display: 'block' }} playsInline crossOrigin="anonymous" />
    </div>
  )
})

PlyrPlayer.displayName = 'PlyrPlayer'

export default PlyrPlayer
