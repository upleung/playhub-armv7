import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Typography } from 'antd'
import { ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PlyrPlayer from '../components/PlyrPlayer'
import { useStore } from '../stores/useStore'

const { Text } = Typography

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}

export default function PlayerView() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const store = useStore()
  const videoUrl = params.get('url') || ''
  const title = params.get('title') || ''
  const episode = params.get('ep') || ''
  const source = params.get('source') || ''
  const vod = params.get('vod') || ''
  const isGroup = params.get('group') === '1'
  const seekTime = parseFloat(params.get('seek') || '0') || 0

  const [speedBoost, setSpeedBoost] = useState(false)
  const [playerKey, setPlayerKey] = useState(0)
  const longPressTimer = useRef(null)
  const saveTimerRef = useRef(null)
  const seekedRef = useRef(false)

  // Auto-seek to last position
  useEffect(() => {
    if (seekTime <= 0 || seekedRef.current) return

    const doSeek = () => {
      if (seekedRef.current) return
      const video = document.querySelector('video')
      if (!video) {
        setTimeout(doSeek, 500)
        return
      }

      const trySetTime = () => {
        if (seekedRef.current) return
        if (video.duration > 0 && !isNaN(video.duration) && video.readyState >= 2) {
          video.currentTime = Math.min(seekTime, video.duration - 1)
          seekedRef.current = true
        }
      }

      video.addEventListener('loadeddata', trySetTime, { once: true })
      video.addEventListener('canplay', trySetTime, { once: true })
      setTimeout(() => {
        if (!seekedRef.current && video.readyState >= 1) {
          video.currentTime = seekTime
          seekedRef.current = true
        }
      }, 2000)
    }

    const timer = setTimeout(doSeek, 800)
    return () => clearTimeout(timer)
  }, [seekTime, videoUrl, playerKey])

  // Save currentTime periodically
  useEffect(() => {
    const saveTime = () => {
      const video = document.querySelector('video')
      if (video && video.currentTime > 0) {
        store.updateHistoryTime(source, vod, video.currentTime, isGroup, title)
      }
    }
    saveTimerRef.current = setInterval(saveTime, 5000)
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
      saveTime()
    }
  }, [source, vod, isGroup, title])

  const handleBack = useCallback(() => {
    const video = document.querySelector('video')
    if (video && video.currentTime > 0) {
      store.updateHistoryTime(source, vod, video.currentTime, isGroup, title)
    }
    if (isGroup) {
      navigate(`/detail?source=${source}&vod=${vod}&group=1`)
    } else if (source && vod) {
      navigate(`/detail?source=${source}&vod=${vod}`)
    } else {
      navigate(-1)
    }
  }, [source, vod, isGroup, title, navigate])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        const video = document.querySelector('video')
        if (video) {
          if (video.paused) video.play()
          else video.pause()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Long press for speed boost
  const handleMouseDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      const video = document.querySelector('video')
      if (video) {
        video.playbackRate = 3
        setSpeedBoost(true)
      }
    }, 500)
  }, [])

  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (speedBoost) {
      const video = document.querySelector('video')
      if (video) video.playbackRate = 1
      setSpeedBoost(false)
    }
  }, [speedBoost])

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ background: '#000', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.8)', flexShrink: 0 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ color: '#fff' }} />
        <div style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>{title}</Text>
          {episode && <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginLeft: 8 }}>{episode}</Text>}
        </div>
        {source && vod && (
          <Button type="text" icon={<InfoCircleOutlined />} onClick={handleBack} style={{ color: 'rgba(255,255,255,0.7)' }}>
            详情
          </Button>
        )}
      </div>

      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
      >
        {videoUrl ? (
          <div style={{ position: 'relative', width: '100%', maxWidth: 1200 }}>
            <PlyrPlayer
              key={playerKey}
              url={videoUrl}
              style={{ borderRadius: 12, overflow: 'hidden' }}
            />
            {speedBoost && (
              <div style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'rgba(255, 77, 79, 0.9)',
                color: '#fff',
                padding: '6px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                zIndex: 10,
              }}>
                3x 倍速
              </div>
            )}
          </div>
        ) : (
          <Text style={{ color: '#fff' }}>无可用播放地址</Text>
        )}
      </div>

      <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.6)', textAlign: 'center', flexShrink: 0 }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
          长按屏幕加速播放 · 空格键暂停/播放
        </Text>
      </div>
    </motion.div>
  )
}
