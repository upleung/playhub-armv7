import React, { useState, useRef, useEffect } from 'react'
import { Card, Tag, Typography } from 'antd'
import { PlayCircleOutlined, CloudServerOutlined, StarFilled } from '@ant-design/icons'

const { Text } = Typography

export default function VideoCard({ video, onClick, style, index = 0 }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
      },
      { rootMargin: '200px' }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const hasMultiSources = video.sources && video.sources.length > 1

  return (
    <div
      ref={ref}
      className={`video-card animate-fade-in-up stagger-${(index % 6) + 1}`}
      style={style}
      onClick={() => onClick?.(video)}
    >
      <Card
        hoverable
        cover={
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
            {visible && !error ? (
              <img
                src={video.pic}
                alt={video.name}
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
                onLoad={() => setLoaded(true)}
                onError={(e) => {
                  // Try without crossOrigin if it fails
                  if (e.target.crossOrigin) {
                    e.target.crossOrigin = null
                    e.target.src = video.pic
                  } else {
                    setError(true)
                  }
                }}
              />
            ) : null}
            {!loaded && !error && (
              <div style={{ width: '100%', aspectRatio: '2/3', background: '#f5f5f5' }}>
                <div className="skeleton-shimmer" style={{ width: '100%', height: '100%' }} />
              </div>
            )}
            {error && (
              <div style={{ width: '100%', aspectRatio: '2/3', background: 'linear-gradient(135deg, #e6f4ff, #f0f5ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                <PlayCircleOutlined style={{ fontSize: 32, color: '#91caff' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>暂无封面</Text>
              </div>
            )}
            {video.remarks && <span className="remarks-badge">{video.remarks}</span>}
            {video.isBestMatch && (
              <span style={{ position: 'absolute', top: 8, right: 8, background: 'linear-gradient(135deg, #faad14, #ff4d4f)', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, zIndex: 1 }}>
                <StarFilled style={{ fontSize: 10 }} />
                AI推荐
              </span>
            )}
            {hasMultiSources && (
              <span className="source-badge" style={{ background: 'rgba(82, 196, 26, 0.9)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CloudServerOutlined style={{ fontSize: 10 }} />
                {video.sources.length}源
              </span>
            )}
            {video.sourceName && !hasMultiSources && (
              <span className="source-badge">{video.sourceName}</span>
            )}
          </div>
        }
        styles={{ body: { padding: '12px 16px', borderRadius: '0 0 16px 16px' } }}
        style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #f0f0f0' }}
      >
        <Text strong ellipsis={{ tooltip: video.name }} style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
          {video.name}
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {video.year && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{video.year}</Tag>}
          {video.type && <Tag color="default" style={{ margin: 0, fontSize: 11 }}>{video.type}</Tag>}
        </div>
      </Card>
    </div>
  )
}
