import React, { useEffect, useState, useCallback } from 'react'
import { Input, Tabs, Typography, Spin, Empty, Button, AutoComplete } from 'antd'
import { SearchOutlined, RobotOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import VideoCard from '../components/VideoCard'
import { classIdOf, classNameOf } from '../utils'

const { Text, Title } = Typography

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

export default function HomeView() {
  const navigate = useNavigate()
  const store = useStore()
  const [searchValue, setSearchValue] = useState('')

  useEffect(() => {
    if (store.bootstrapped && store.sources.length > 0 && store.wallVideos.length === 0 && !store.loading.wall) {
      store.loadHome()
    }
  }, [store.bootstrapped, store.sources.length])

  const handleSearch = useCallback(
    (value) => {
      const kw = value.trim()
      if (!kw) return
      store.searchVideos(kw)
    },
    [store]
  )

  const handleClearSearch = useCallback(() => {
    setSearchValue('')
    store.loadHome()
  }, [store])

  const handleVideoClick = useCallback(
    (video) => {
      if (video.isGroup) {
        const sourceUid = video.sources?.[0]?.uid || ''
        const vodId = video.sources?.[0]?.vodId || ''
        navigate(`/detail?source=${sourceUid}&vod=${vodId}&group=1`)
      } else {
        const sourceUid = video.sourceUid || ''
        const vodId = video.id
        navigate(`/detail?source=${sourceUid}&vod=${vodId}`)
      }
    },
    [navigate]
  )

  const handleTabChange = useCallback(
    (key) => {
      if (key === '__home__') {
        store.loadHome()
      } else {
        store.loadCategory(key)
      }
    },
    [store]
  )

  const { wallVideos, loading, classes, activeClassId, wallTitle, searchProgress, wallMode, searchKeyword, searchHistory, sources, configUrl } = store
  const isSearching = wallMode === 'search'

  const tabItems = [
    { key: '__home__', label: '推荐' },
    ...classes.map((c) => ({
      key: classIdOf(c),
      label: classNameOf(c),
    })),
  ]

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
          padding: '24px 28px',
          marginBottom: 24,
          border: '1px solid #f0f0f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#1a1a2e' }}>
            {wallTitle || '发现'}
          </Title>
        </div>

        <AutoComplete
          value={searchValue}
          options={searchHistory.map((kw) => ({
            value: kw,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClockCircleOutlined style={{ color: '#999', fontSize: 12 }} />
                <span>{kw}</span>
              </div>
            ),
          }))}
          onChange={setSearchValue}
          onSelect={(val) => { setSearchValue(val); store.searchVideos(val) }}
          style={{ width: '100%', marginBottom: isSearching ? 0 : 16 }}
          disabled={searchProgress.active}
        >
          <Input.Search
            placeholder="搜索视频名称..."
            allowClear
            enterButton={<><SearchOutlined /> 搜索</>}
            size="large"
            onSearch={handleSearch}
          />
        </AutoComplete>

        {searchProgress.active && (
          <div
            style={{
              marginTop: 12,
              padding: '14px 18px',
              background: '#e6f4ff',
              borderRadius: 12,
              border: '1px solid #91caff',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Spin size="small" />
            <Text style={{ fontWeight: 500 }}>
              正在搜索 {searchProgress.completed}/{searchProgress.total} 个源...
            </Text>
          </div>
        )}

        {searchProgress.aiProcessing && (
          <div
            className="rainbow-border"
            style={{
              marginTop: 12,
              padding: '14px 18px',
              background: '#fff',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <RobotOutlined style={{ fontSize: 18, color: '#722ed1' }} />
            <span className="rainbow-text" style={{ fontWeight: 600, fontSize: 14 }}>
              AI 正在分析和合并搜索结果...
            </span>
          </div>
        )}

        {isSearching && !searchProgress.active && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 16px',
              background: '#f0f5ff',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 13, color: '#1677ff' }}>
              搜索 "{searchKeyword}" 的结果 · {wallVideos.length} 个视频
            </Text>
            <Button type="link" size="small" onClick={handleClearSearch}>
              清除搜索
            </Button>
          </div>
        )}

        {!isSearching && (
          <Tabs
            activeKey={wallMode === 'home' ? '__home__' : activeClassId}
            items={tabItems}
            onChange={handleTabChange}
            style={{ marginBottom: 0 }}
          />
        )}
      </div>

      {loading.wall && wallVideos.length === 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 20,
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ borderRadius: 16, overflow: 'hidden' }}>
              <div className="skeleton-shimmer" style={{ aspectRatio: '2/3', borderRadius: 16 }} />
              <div style={{ padding: '12px 0' }}>
                <div className="skeleton-shimmer" style={{ height: 16, width: '80%', borderRadius: 4, marginBottom: 8 }} />
                <div className="skeleton-shimmer" style={{ height: 12, width: '40%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : !configUrl && sources.length === 0 ? (
        <Empty
          description={
            <span>
              未配置数据源
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>请在设置中加载 TVBox 配置</Text>
            </span>
          }
          style={{ padding: '80px 0', background: '#fff', borderRadius: 20, border: '1px solid #f0f0f0' }}
        />
      ) : wallVideos.length === 0 ? (
        <Empty
          description={
            <span>
              {searchKeyword ? '未找到相关视频' : '暂无内容'}
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>
                {searchKeyword ? '试试其他关键词' : '请在设置中加载配置'}
              </Text>
            </span>
          }
          style={{ padding: '80px 0' }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 20,
          }}
        >
          {wallVideos.map((video, i) => (
            <VideoCard
              key={`${video.sourceUid}-${video.id}-${i}`}
              video={video}
              index={i}
              onClick={handleVideoClick}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
