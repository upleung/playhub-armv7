import React, { useCallback } from 'react'
import { Typography, Button, Empty, Popconfirm, Space } from 'antd'
import { DeleteOutlined, HistoryOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import VideoCard from '../components/VideoCard'
import { formatHistoryTime } from '../utils'

const { Title, Text } = Typography

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

export default function HistoryView() {
  const navigate = useNavigate()
  const history = useStore((s) => s.history)
  const clearHistory = useStore((s) => s.clearHistory)

  const handleClick = useCallback(
    (entry) => {
      if (entry.isGroup && entry.sources?.length) {
        // Navigate to group detail with sources
        navigate(`/detail?source=${entry.sources[0]?.uid || ''}&vod=${entry.sources[0]?.vodId || ''}&group=1`)
      } else if (entry.url) {
        navigate(`/player?url=${encodeURIComponent(entry.url)}&title=${encodeURIComponent(entry.title || '')}&ep=${encodeURIComponent(entry.episodeName || '')}&source=${entry.sourceUid}&vod=${entry.vodId}`)
      } else {
        navigate(`/detail?source=${entry.sourceUid}&vod=${entry.vodId}`)
      }
    },
    [navigate]
  )

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '28px 32px',
          marginBottom: 24,
          border: '1px solid #f0f0f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <HistoryOutlined />
            观看记录
          </Title>
          <Text type="secondary">{history.length} 条记录</Text>
        </div>
        {history.length > 0 && (
          <Popconfirm title="确定清空所有记录？" onConfirm={clearHistory} okText="确定" cancelText="取消">
            <Button danger icon={<DeleteOutlined />}>
              清空记录
            </Button>
          </Popconfirm>
        )}
      </div>

      {history.length === 0 ? (
        <Empty
          description={
            <span>
              暂无观看记录
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>观看视频后会自动记录</Text>
            </span>
          }
          style={{ padding: '80px 0' }}
        >
          <Button type="primary" onClick={() => navigate('/')}>
            去看视频
          </Button>
        </Empty>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 20,
          }}
        >
          {history.map((entry, i) => (
            <div
              key={entry.isGroup ? `group-${entry.title}-${i}` : `${entry.sourceUid}-${entry.vodId}-${i}`}
              className={`animate-fade-in-up stagger-${(i % 6) + 1}`}
              style={{ cursor: 'pointer' }}
              onClick={() => handleClick(entry)}
            >
              <div
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: '#fff',
                  border: '1px solid #f0f0f0',
                  transition: 'all 0.25s ease',
                }}
                className="video-card"
              >
                <div style={{ position: 'relative', overflow: 'hidden' }}>
                  {entry.poster ? (
                    <img
                      src={entry.poster}
                      alt={entry.title}
                      style={{
                        width: '100%',
                        aspectRatio: '2/3',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '2/3',
                      background: 'linear-gradient(135deg, #e6f4ff, #f0f5ff)',
                      display: entry.poster ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PlayCircleOutlined style={{ fontSize: 40, color: '#91caff' }} />
                  </div>
                  {entry.episodeName && (
                    <span className="remarks-badge">
                      {entry.episodeName}
                    </span>
                  )}
                  {entry.isGroup && entry.sources?.length > 1 && (
                    <span style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      background: 'rgba(82, 196, 26, 0.9)',
                      color: '#fff',
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                    }}>
                      {entry.sources.length}源
                    </span>
                  )}
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <Text strong ellipsis style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
                    {entry.title || '未知'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatHistoryTime(entry.timestamp)}
                  </Text>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
