import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Typography, Button, Empty, Spin, Tag, Space, message, Progress } from 'antd'
import { VideoCameraOutlined, ReloadOutlined, SoundOutlined, WarningOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import { useStore } from '../stores/useStore'
import PlyrPlayer from '../components/PlyrPlayer'

const { Title, Text } = Typography

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

function formatClock(ts) {
  if (!ts) return '--:--'
  const d = new Date(Number(ts) || ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function getCurrentProgramme(programmes) {
  if (!programmes?.length) return null
  const now = Date.now()
  return programmes.find((p) => {
    const start = new Date(p.start).getTime()
    const end = new Date(p.end).getTime()
    return now >= start && now <= end
  }) || null
}

function getNextProgramme(programmes) {
  if (!programmes?.length) return null
  const now = Date.now()
  return programmes.find((p) => new Date(p.start).getTime() > now) || null
}

function getVisibleProgrammes(programmes) {
  if (!programmes?.length) return []
  const now = Date.now()
  const idx = programmes.findIndex((p) => new Date(p.end).getTime() > now)
  const start = idx > 1 ? idx - 1 : Math.max(idx, 0)
  return programmes.slice(start, start + 10)
}

function programmeState(p) {
  const now = Date.now()
  const start = new Date(p.start).getTime()
  const end = new Date(p.end).getTime()
  if (start <= now && end > now) return 'live'
  if (start > now) return 'upcoming'
  return 'past'
}

export default function LiveView() {
  const store = useStore()
  const { liveChannels, liveGroups, currentLiveChannelId, currentLiveSourceIndex, settings } = store
  const [loading, setLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [playerFailed, setPlayerFailed] = useState(false)
  const [streamReady, setStreamReady] = useState(false)
  const [now, setNow] = useState(Date.now())
  const failoverTimer = useRef(null)

  const handleLoad = useCallback(async () => {
    const url = settings.liveSourceUrl
    if (!url) { message.warning('请先在设置中配置直播源地址'); return }
    setLoading(true)
    try { await store.loadLiveData(url, settings.liveEpgUrl) } catch { message.error('加载直播源失败') }
    finally { setLoading(false) }
  }, [settings.liveSourceUrl, settings.liveEpgUrl, store])

  useEffect(() => { if (liveChannels.length === 0 && settings.liveSourceUrl) handleLoad() }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const currentChannel = liveChannels.find((c) => c.id === currentLiveChannelId)
  const currentSource = currentChannel?.sources?.[currentLiveSourceIndex]
  const programmes = currentChannel?.programmes || []
  const currentProgramme = getCurrentProgramme(programmes)
  const nextProgramme = getNextProgramme(programmes)
  const visibleProgrammes = getVisibleProgrammes(programmes)

  const progressPercent = currentProgramme ? (() => {
    const start = new Date(currentProgramme.start).getTime()
    const end = new Date(currentProgramme.end).getTime()
    if (end <= start) return 0
    return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
  })() : 0

  useEffect(() => {
    setPlayerFailed(false)
    setStreamReady(false)
    if (failoverTimer.current) { clearTimeout(failoverTimer.current); failoverTimer.current = null }
    if (currentSource?.url) {
      failoverTimer.current = setTimeout(() => {
        if (!streamReady) {
          const switched = store.selectNextLiveSource()
          if (switched) message.warning('当前源响应超时，已自动切换')
          else { setPlayerFailed(true); message.error('所有源均无法播放') }
        }
      }, 12000)
    }
    return () => { if (failoverTimer.current) { clearTimeout(failoverTimer.current); failoverTimer.current = null } }
  }, [currentLiveChannelId, currentLiveSourceIndex])

  const handlePlayerReady = useCallback(() => {
    setStreamReady(true)
    if (failoverTimer.current) { clearTimeout(failoverTimer.current); failoverTimer.current = null }
  }, [])

  const handlePlayerError = useCallback(() => {
    setStreamReady(false)
    if (failoverTimer.current) { clearTimeout(failoverTimer.current); failoverTimer.current = null }
    const switched = store.selectNextLiveSource()
    if (switched) { message.warning('当前源不可播放，已自动切换'); setPlayerFailed(false) }
    else { setPlayerFailed(true); message.error('当前频道的可用源都播放失败了') }
  }, [store])

  const filteredChannels = selectedGroup ? liveChannels.filter((c) => c.group === selectedGroup) : liveChannels

  if (!settings.liveSourceUrl) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '60px 32px', textAlign: 'center', border: '1px solid #f0f0f0' }}>
          <VideoCameraOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
          <Title level={4} style={{ color: '#999' }}>未配置直播源</Title>
          <Text type="secondary">请在设置中添加 M3U 直播源地址</Text>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '20px 24px', marginBottom: 20, border: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <VideoCameraOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <div>
            <Title level={4} style={{ margin: 0 }}>电视直播</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>{liveChannels.length} 个频道 · {liveGroups.length} 个分组</Text>
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={handleLoad} loading={loading}>刷新</Button>
      </div>

      {loading && liveChannels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /><Text style={{ display: 'block', marginTop: 16, color: '#999' }}>加载中...</Text></div>
      ) : liveChannels.length === 0 ? (
        <Empty description="暂无频道" />
      ) : (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* Channel List */}
          <div style={{ flex: '0 0 300px', background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', overflow: 'hidden', maxHeight: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
            {liveGroups.length > 0 && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Tag color={!selectedGroup ? 'blue' : 'default'} style={{ cursor: 'pointer', borderRadius: 6 }} onClick={() => setSelectedGroup('')}>全部</Tag>
                {liveGroups.map((g) => (
                  <Tag key={g.name} color={selectedGroup === g.name ? 'blue' : 'default'} style={{ cursor: 'pointer', borderRadius: 6 }} onClick={() => setSelectedGroup(g.name)}>{g.name} ({g.count})</Tag>
                ))}
              </div>
            )}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {filteredChannels.map((ch) => {
                const prog = getCurrentProgramme(ch.programmes)
                return (
                  <div key={ch.id} onClick={() => store.selectLiveChannel(ch.id)} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', background: currentLiveChannelId === ch.id ? '#e6f4ff' : 'transparent', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: currentLiveChannelId === ch.id ? '#1677ff' : '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SoundOutlined style={{ fontSize: 16, color: currentLiveChannelId === ch.id ? '#fff' : '#999' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong={currentLiveChannelId === ch.id} style={{ display: 'block', color: currentLiveChannelId === ch.id ? '#1677ff' : '#333', fontSize: 14 }}>{ch.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }} ellipsis>{ch.group}{ch.sources?.length > 1 && ` · ${ch.sources.length}源`}{prog && ` · ${prog.title}`}</Text>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Player + EPG */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {currentChannel && currentSource?.url && !playerFailed ? (
              <PlyrPlayer key={`${currentLiveChannelId}-${currentLiveSourceIndex}`} url={currentSource.url} onError={handlePlayerError} onReady={handlePlayerReady} style={{ borderRadius: 16, overflow: 'hidden' }} />
            ) : currentChannel && playerFailed ? (
              <div style={{ background: '#fff2f0', borderRadius: 16, aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, border: '1px solid #ffccc7' }}>
                <WarningOutlined style={{ fontSize: 40, color: '#ff4d4f' }} />
                <Text style={{ fontSize: 16, color: '#ff4d4f' }}>所有源均无法播放</Text>
                <Button onClick={() => { setPlayerFailed(false); store.selectLiveSource(0) }}>重试</Button>
              </div>
            ) : (
              <div style={{ background: '#f5f5f5', borderRadius: 16, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="选择频道开始观看" />
              </div>
            )}

            {/* Source Switcher */}
            {currentChannel && currentChannel.sources?.length > 1 && (
              <div style={{ background: '#fff', borderRadius: 12, marginTop: 12, padding: '12px 16px', border: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 13, color: '#666', marginRight: 4 }}>频道源:</Text>
                {currentChannel.sources.map((src, i) => (
                  <Button key={i} type={currentLiveSourceIndex === i ? 'primary' : 'default'} size="small" onClick={() => { store.selectLiveSource(i); setPlayerFailed(false) }} style={{ borderRadius: 6 }}>
                    {src.label || `源${i + 1}`}
                  </Button>
                ))}
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>失败会自动换到下一源</Text>
              </div>
            )}

            {/* Now Playing */}
            {currentChannel && (
              <div style={{ background: '#fff', borderRadius: 16, marginTop: 12, padding: '16px 20px', border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Title level={5} style={{ margin: 0 }}>{currentChannel.name}</Title>
                  <Tag color="blue">{currentChannel.group}</Tag>
                </div>

                {currentProgramme && (
                  <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f6ffed', borderRadius: 10, border: '1px solid #b7eb8f' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, color: '#52c41a', fontWeight: 600 }}>
                        <ClockCircleOutlined style={{ marginRight: 6 }} />
                        {currentProgramme.title}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{formatClock(currentProgramme.start)} - {formatClock(currentProgramme.end)}</Text>
                    </div>
                    <Progress percent={progressPercent} strokeColor="#52c41a" size="small" showInfo={false} />
                    {currentProgramme.desc && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 6 }}>{currentProgramme.desc}</Text>}
                  </div>
                )}

                {nextProgramme && (
                  <div style={{ padding: '8px 12px', background: '#f0f5ff', borderRadius: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, color: '#1677ff' }}>下一档: {nextProgramme.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{formatClock(nextProgramme.start)} - {formatClock(nextProgramme.end)}</Text>
                  </div>
                )}
              </div>
            )}

            {/* EPG Timeline */}
            {visibleProgrammes.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 16, marginTop: 12, padding: '16px 20px', border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Title level={5} style={{ margin: 0 }}>节目单</Title>
                  <Tag color={settings.liveEpgUrl ? 'green' : 'default'}>{settings.liveEpgUrl ? 'EPG 已接入' : '未配置 EPG'}</Tag>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleProgrammes.map((p, i) => {
                    const state = programmeState(p)
                    return (
                      <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10, background: state === 'live' ? '#f6ffed' : state === 'upcoming' ? '#f0f5ff' : '#fafafa', border: state === 'live' ? '1px solid #b7eb8f' : '1px solid transparent' }}>
                        <div style={{ width: 100, flexShrink: 0, textAlign: 'right' }}>
                          <Text strong style={{ fontSize: 13, color: state === 'live' ? '#52c41a' : state === 'upcoming' ? '#1677ff' : '#999' }}>{formatClock(p.start)}</Text>
                          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{formatClock(p.end)}</Text>
                        </div>
                        <div style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: state === 'live' ? 600 : 400, color: state === 'live' ? '#52c41a' : state === 'upcoming' ? '#1677ff' : '#666' }}>{p.title}</Text>
                          {p.desc && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }} ellipsis>{p.desc}</Text>}
                        </div>
                        <Tag color={state === 'live' ? 'success' : state === 'upcoming' ? 'processing' : 'default'} style={{ flexShrink: 0, borderRadius: 4, fontSize: 11 }}>
                          {state === 'live' ? '直播中' : state === 'upcoming' ? '即将' : '已播'}
                        </Tag>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
