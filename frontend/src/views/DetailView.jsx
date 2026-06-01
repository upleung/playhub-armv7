import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Typography, Button, Tag, Divider, Empty, message, Spin, Space, Select, Progress } from 'antd'
import {
  ArrowLeftOutlined, PlayCircleOutlined, CloudServerOutlined,
  ReloadOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import { formatMeta, buildPlayableUrl } from '../utils'
import * as api from '../api'

const { Title, Text, Paragraph } = Typography

async function cleanUrlWithAI(url, settings) {
  const prompt = `你是一个URL清理助手。请分析以下播放地址，去掉所有无关参数和路径，只保留最核心的可以直接播放的视频URL。

规则：
1. 如果URL本身就简洁且可播放（如 .m3u8 .mp4 结尾），直接返回
2. 去掉追踪参数（如 ?from=xxx&ref=xxx）
3. 保留必要的鉴权参数（如 ?token=xxx）
4. 将拼接格式的URL（如 url1#url2）拆分，只返回第一个可播放的
5. 只返回纯URL，不要任何解释

输入URL: ${url}

输出: 只输出清洗后的URL，不要其他内容`

  try {
    const res = await fetch(`${settings.aiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.aiKey}` },
      body: JSON.stringify({ model: settings.aiModel || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 200, temperature: 0 }),
    })
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    // Extract URL from response
    const urlMatch = content.match(/https?:\/\/[^\s]+/)
    return urlMatch ? urlMatch[0] : null
  } catch {
    return null
  }
}

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

export default function DetailView() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const store = useStore()
  const sourceUid = params.get('source') || ''
  const vodId = params.get('vod') || ''
  const isGroup = params.get('group') === '1'

  const [selectedLine, setSelectedLine] = useState(0)
  const [selectedEp, setSelectedEp] = useState(-1)
  const [loadingEpIdx, setLoadingEpIdx] = useState(-1)
  const [autoPlaying, setAutoPlaying] = useState(false)
  const [groupLines, setGroupLines] = useState([])
  const [groupDetail, setGroupDetail] = useState(null)
  const [groupLoading, setGroupLoading] = useState(false)
  const [aiDetailProcessing, setAiDetailProcessing] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [fetchProgress, setFetchProgress] = useState({ done: 0, total: 0 })
  const loadKeyRef = useRef('')

  const detail = store.currentDetail
  const wallVideo = store.wallVideos.find((v) => v.id === vodId || v.sources?.some((s) => s.vodId === vodId))

  // Get history entry
  const historyEntry = isGroup
    ? store.history.find((h) => h.isGroup && h.sources?.some((s) => s.vodId === vodId || s.uid === sourceUid))
    : store.history.find((h) => !h.isGroup && h.sourceUid === sourceUid && h.vodId === vodId)

  const groupSources = wallVideo?.sources || historyEntry?.sources || []

  // Load group lines
  useEffect(() => {
    if (!isGroup) return
    if (groupSources.length === 0) return

    const loadKey = groupSources.map((s) => s.uid).sort().join(',')
    if (loadKeyRef.current === loadKey) return
    loadKeyRef.current = loadKey

    setLoadError(null)
    setGroupLoading(true)
    setGroupLines([])
    setGroupDetail(null)

    store.ensureGroupLines(
      groupSources,
      (done, total) => setFetchProgress({ done, total }),
      (processing) => setAiDetailProcessing(processing)
    ).then((result) => {
      if (result.lines.length === 0) {
        setLoadError('无可用线路')
      } else {
        setGroupLines(result.lines)
        setGroupDetail(result.detail)
        restoreFromHistory(result.lines, historyEntry)
      }
    }).catch(() => {
      setLoadError('加载失败')
    }).finally(() => {
      setGroupLoading(false)
      setAiDetailProcessing(false)
    })
  }, [isGroup, sourceUid, vodId])

  // Load single source detail
  useEffect(() => {
    if (isGroup || !sourceUid || !vodId) return

    const loadKey = `${sourceUid}::${vodId}`
    if (loadKeyRef.current === loadKey) return
    loadKeyRef.current = loadKey

    setLoadError(null)
    store.ensureDetail(sourceUid, vodId).then((d) => {
      if (!d) {
        setLoadError('加载失败')
      } else if (historyEntry) {
        // Find line by flagName
        if (historyEntry.flagName) {
          const lineIdx = d.playGroups?.findIndex((g) => g.flag === historyEntry.flagName) ?? -1
          if (lineIdx >= 0) {
            setSelectedLine(lineIdx)
            setSelectedEp(historyEntry.episodeIndex ?? -1)
          }
        } else {
          setSelectedLine(historyEntry.lineIndex ?? 0)
          setSelectedEp(historyEntry.episodeIndex ?? -1)
        }
      }
    })
  }, [sourceUid, vodId, isGroup])

  const handleGroupPlay = useCallback(
    (lineIndex, episodeIndex = 0) => {
      const line = groupLines[lineIndex]
      if (!line) return
      const ep = line.episodes[episodeIndex]
      if (!ep) return

      setLoadingEpIdx(episodeIndex)
      setSelectedEp(episodeIndex)

      // Check if same episode with saved time
      const lastEntry = store.history.find((h) => h.isGroup && h.title === (groupDetail?.name || wallVideo?.name || ''))
      const seekTime = (lastEntry?.flagName === line.groupName && lastEntry?.episodeIndex === episodeIndex && lastEntry?.currentTime > 0)
        ? lastEntry.currentTime : 0

      api.sourcePlay(line.sourceUid, line.groupName, ep.id || ep.url).then(async (playPayload) => {
        let playUrl = buildPlayableUrl(playPayload, ep.id || ep.url)

        // AI URL cleaning
        if (store.settings.aiEnabled && store.settings.aiUrl && store.settings.aiKey && playUrl) {
          try {
            const cleaned = await cleanUrlWithAI(playUrl, store.settings)
            if (cleaned) playUrl = cleaned
          } catch {}
        }

        store.upsertHistory({
          sourceUid: line.sourceUid,
          vodId: wallVideo?.id || historyEntry?.vodId || '',
          title: groupDetail?.name || wallVideo?.name || historyEntry?.title || '',
          poster: groupDetail?.pic || wallVideo?.pic || historyEntry?.poster || '',
          flagName: line.groupName,
          episodeIndex,
          episodeName: ep.name,
          url: playUrl,
          sources: groupSources,
          isGroup: true,
          lineIndex,
        })
        navigate(`/player?url=${encodeURIComponent(playUrl)}&title=${encodeURIComponent(groupDetail?.name || wallVideo?.name || '')}&ep=${encodeURIComponent(ep.name)}&source=${line.sourceUid}&vod=${wallVideo?.id || ''}&group=1&seek=${seekTime}`)
      }).catch(() => message.error('获取播放地址失败'))
      .finally(() => setLoadingEpIdx(-1))
    },
    [groupLines, wallVideo, groupDetail, groupSources, store, navigate]
  )

  const handleDetailPlay = useCallback(
    (groupIndex, episodeIndex, isMainBtn = false) => {
      const d = store.currentDetail
      if (!d) return
      const group = d.playGroups[groupIndex]
      if (!group) return
      setLoadingEpIdx(episodeIndex)
      setSelectedEp(episodeIndex)
      if (isMainBtn) setAutoPlaying(true)

      const lastEntry = store.history.find((h) => !h.isGroup && h.sourceUid === d.sourceUid && h.vodId === d.id)
      const seekTime = (lastEntry?.flagName === group.flag && lastEntry?.episodeIndex === episodeIndex && lastEntry?.currentTime > 0)
        ? lastEntry.currentTime : 0

      store.playEpisode(d.sourceUid, d.id, group.flag, episodeIndex).then(async (playback) => {
        if (playback?.url) {
          let playUrl = playback.url
          if (store.settings.aiEnabled && store.settings.aiUrl && store.settings.aiKey) {
            try { const cleaned = await cleanUrlWithAI(playUrl, store.settings); if (cleaned) playUrl = cleaned } catch {}
          }
          store.upsertHistory({ ...playback, lineIndex: groupIndex, url: playUrl })
          navigate(`/player?url=${encodeURIComponent(playUrl)}&title=${encodeURIComponent(playback.title)}&ep=${encodeURIComponent(playback.episodeName)}&source=${d.sourceUid}&vod=${d.id}&seek=${seekTime}`)
        }
      }).catch((err) => message.error('播放失败: ' + err.message))
      .finally(() => { setLoadingEpIdx(-1); if (isMainBtn) setAutoPlaying(false) })
    },
    [store, navigate]
  )

  const handleRetry = useCallback(() => {
    loadKeyRef.current = ''
    if (isGroup) {
      setGroupLines([])
      setGroupDetail(null)
    } else {
      store.ensureDetail(sourceUid, vodId, { force: true })
    }
  }, [isGroup, sourceUid, vodId])

  // Go back to home if coming from search/wall, otherwise go back
  const handleBack = useCallback(() => {
    if (isGroup || store.wallMode === 'search') {
      navigate('/')
    } else {
      navigate(-1)
    }
  }, [isGroup, navigate])

  // Group mode
  if (isGroup) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ marginBottom: 16 }}>返回</Button>

        <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            <div style={{ width: 280, minHeight: 400, position: 'relative', overflow: 'hidden', flexShrink: 0, background: '#f5f5f5' }}>
              {(wallVideo?.pic || groupDetail?.pic || historyEntry?.poster) ? (
                <img src={wallVideo?.pic || groupDetail?.pic || historyEntry?.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlayCircleOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                </div>
              )}
              {groupSources.length > 1 && (
                <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(82, 196, 26, 0.9)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                  {groupSources.length} 源
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 300, padding: '28px 32px' }}>
              <Title level={2} style={{ margin: '0 0 12px', fontWeight: 700 }}>{groupDetail?.name || wallVideo?.name || historyEntry?.title || ''}</Title>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {groupDetail?.type && <Tag color="processing" style={{ borderRadius: 6 }}>{groupDetail.type}</Tag>}
                {groupDetail?.year && <Tag style={{ borderRadius: 6 }}>{groupDetail.year}</Tag>}
                {groupDetail?.area && <Tag style={{ borderRadius: 6 }}>{groupDetail.area}</Tag>}
                <Tag color="cyan" style={{ borderRadius: 6 }}>{groupLines.length} 条线路</Tag>
              </div>

              {groupDetail?.desc && (
                <Paragraph type="secondary" ellipsis={{ rows: 3, expandable: true, symbol: '展开' }} style={{ marginBottom: 16, fontSize: 14 }}>
                  {groupDetail.desc}
                </Paragraph>
              )}

              {(groupDetail?.director || groupDetail?.actor) && (
                <div style={{ marginBottom: 16 }}>
                  {groupDetail.director && <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>导演: {groupDetail.director}</Text>}
                  {groupDetail.actor && <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>演员: {groupDetail.actor}</Text>}
                </div>
              )}

              {groupLoading && !aiDetailProcessing && (
                <div style={{ padding: '14px 18px', background: '#e6f4ff', borderRadius: 12, border: '1px solid #91caff', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Spin size="small" />
                  <div style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 500 }}>正在获取源信息 {fetchProgress.done}/{fetchProgress.total}...</Text>
                    {fetchProgress.total > 0 && <Progress percent={Math.round((fetchProgress.done / fetchProgress.total) * 100)} size="small" strokeColor="#1677ff" showInfo={false} style={{ marginTop: 4 }} />}
                  </div>
                </div>
              )}

              {aiDetailProcessing && (
                <div className="rainbow-border" style={{ padding: '14px 18px', background: '#fff', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Spin size="small" />
                  <span className="rainbow-text" style={{ fontWeight: 600, fontSize: 14 }}>AI 正在整合视频详情...</span>
                </div>
              )}
            </div>
          </div>

          {/* Lines */}
          {groupLines.length > 0 && (
            <>
              <Divider style={{ margin: 0 }} />
              <div style={{ padding: '24px 32px' }}>
                <Title level={5} style={{ margin: '0 0 16px' }}>播放线路</Title>
                <Select
                  value={selectedLine}
                  onChange={(v) => { setSelectedLine(v); setSelectedEp(-1) }}
                  style={{ width: '100%' }}
                  size="large"
                >
                  {groupLines.map((line, i) => (
                    <Select.Option key={i} value={i}>
                      <CloudServerOutlined style={{ marginRight: 8 }} />
                      {line.displayName} ({line.episodes?.length || 0}集)
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </>
          )}

          {/* Episodes */}
          {groupLines[selectedLine]?.episodes?.length > 0 && (
            <>
              <Divider style={{ margin: 0 }} />
              <div style={{ padding: '24px 32px' }}>
                <Title level={5} style={{ margin: '0 0 16px' }}>选集</Title>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {groupLines[selectedLine].episodes.map((ep, i) => (
                    <Button
                      key={i}
                      type={selectedEp === i ? 'primary' : 'default'}
                      loading={loadingEpIdx === i}
                      onClick={() => handleGroupPlay(selectedLine, i)}
                      style={{ borderRadius: 8, minWidth: 80, height: 40, fontWeight: 500, position: 'relative' }}
                    >
                      {ep.name}
                      {selectedEp === i && historyEntry?.currentTime > 0 && (
                        <span style={{ position: 'absolute', top: -6, right: -6, background: '#faad14', color: '#fff', borderRadius: 8, padding: '0 4px', fontSize: 10, lineHeight: '16px' }}>上次</span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Error state */}
          {!groupLoading && !aiDetailProcessing && groupLines.length === 0 && (
            <div style={{ padding: '40px 32px', textAlign: 'center' }}>
              <Empty description={loadError || '无可用线路'}>
                <Button icon={<ReloadOutlined />} onClick={handleRetry}>重试</Button>
              </Empty>
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  // Single source mode
  if (store.loading.detail && !detail) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 32, padding: '40px 0' }}>
          <div className="skeleton-shimmer" style={{ width: 300, height: 450, borderRadius: 20, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton-shimmer" style={{ height: 36, width: '60%', borderRadius: 8, marginBottom: 16 }} />
            <div className="skeleton-shimmer" style={{ height: 16, width: '40%', borderRadius: 4, marginBottom: 24 }} />
            <div className="skeleton-shimmer" style={{ height: 100, width: '100%', borderRadius: 12 }} />
          </div>
        </div>
      </motion.div>
    )
  }

  if (!detail) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ marginBottom: 16 }}>返回</Button>
        <Empty description={loadError || '未找到视频信息'} style={{ padding: '80px 0', background: '#fff', borderRadius: 20 }}>
          <Space>
            <Button type="primary" onClick={() => navigate('/')}>返回首页</Button>
            <Button icon={<ReloadOutlined />} onClick={handleRetry}>重试</Button>
          </Space>
        </Empty>
      </motion.div>
    )
  }

  const meta = formatMeta(detail)
  const playGroups = detail.playGroups || []
  const currentGroup = playGroups[selectedLine]

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>返回</Button>

      <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          <div style={{ width: 280, minHeight: 400, position: 'relative', overflow: 'hidden', flexShrink: 0, background: '#f5f5f5' }}>
            {detail.pic ? (
              <img src={detail.pic} alt={detail.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PlayCircleOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 300, padding: '28px 32px' }}>
            <Title level={2} style={{ margin: '0 0 12px', fontWeight: 700 }}>{detail.name}</Title>
            {meta && <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{meta}</Text>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {detail.sourceName && <Tag color="blue"><CloudServerOutlined style={{ marginRight: 4 }} />{detail.sourceName}</Tag>}
              {detail.year && <Tag>{detail.year}</Tag>}
              {detail.area && <Tag>{detail.area}</Tag>}
              {detail.type && <Tag color="processing">{detail.type}</Tag>}
              {playGroups.length > 0 && <Tag color="cyan">{playGroups.length} 条线路</Tag>}
            </div>
            {detail.desc && <Paragraph type="secondary" ellipsis={{ rows: 3, expandable: true }} style={{ marginBottom: 20 }}>{detail.desc}</Paragraph>}
            {(detail.director || detail.actor) && (
              <div style={{ marginBottom: 20 }}>
                {detail.director && <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>导演: {detail.director}</Text>}
                {detail.actor && <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>演员: {detail.actor}</Text>}
              </div>
            )}
            <Button type="primary" size="large" icon={<PlayCircleOutlined />} loading={autoPlaying} onClick={() => handleDetailPlay(selectedLine, Math.max(0, selectedEp), true)} style={{ borderRadius: 10, height: 48, fontWeight: 600 }}>
              {selectedEp >= 0 ? `播放 ${currentGroup?.episodes?.[selectedEp]?.name || ''}` : '立即播放'}
            </Button>
          </div>
        </div>

        {playGroups.length > 0 && (
          <>
            <Divider style={{ margin: 0 }} />
            <div style={{ padding: '24px 32px' }}>
              <Title level={5} style={{ margin: '0 0 16px' }}>播放线路</Title>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {playGroups.map((g, i) => (
                  <Tag
                    key={i}
                    color={selectedLine === i ? 'blue' : 'default'}
                    style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 8 }}
                    onClick={() => { setSelectedLine(i); setSelectedEp(-1) }}
                  >
                    <CloudServerOutlined style={{ marginRight: 4 }} />
                    {g.flag}
                  </Tag>
                ))}
              </div>
            </div>
          </>
        )}

        {currentGroup?.episodes?.length > 0 && (
          <>
            <Divider style={{ margin: 0 }} />
            <div style={{ padding: '24px 32px' }}>
              <Title level={5} style={{ margin: '0 0 16px' }}>选集 ({currentGroup.flag})</Title>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {currentGroup.episodes.map((ep, i) => (
                  <Button
                    key={i}
                    type={selectedEp === i ? 'primary' : 'default'}
                    loading={loadingEpIdx === i}
                    onClick={() => handleDetailPlay(selectedLine, i, false)}
                    style={{ borderRadius: 8, minWidth: 80, height: 40, fontWeight: 500, position: 'relative' }}
                  >
                    {ep.name}
                    {selectedEp === i && historyEntry?.currentTime > 0 && (
                      <span style={{ position: 'absolute', top: -6, right: -6, background: '#faad14', color: '#fff', borderRadius: 8, padding: '0 4px', fontSize: 10, lineHeight: '16px' }}>上次</span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
