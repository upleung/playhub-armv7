export function normalizeList(payload) {
  if (!payload) return []
  if (Array.isArray(payload.list)) return payload.list
  if (payload.data && Array.isArray(payload.data.list)) return payload.data.list
  if (Array.isArray(payload.videoList)) return payload.videoList
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.videos)) return payload.videos
  return []
}

export function normalizeClasses(payload) {
  if (!payload) return []
  if (Array.isArray(payload.class)) return payload.class
  if (Array.isArray(payload.classes)) return payload.classes
  if (payload.classes && Array.isArray(payload.classes.sortList)) return payload.classes.sortList
  return []
}

export function extractPageMeta(payload, fallbackPage = 1, fallbackSize = 24) {
  const list = normalizeList(payload)
  const limitCandidates = [payload?.limit, payload?.pageSize, payload?.pagesize, payload?.size, list.length, fallbackSize]
  const limit = limitCandidates
    .map((v) => Number(v))
    .find((v) => Number.isFinite(v) && v > 0 && v < 500)

  const pageCandidates = [payload?.page, payload?.pg, fallbackPage]
  const page = pageCandidates
    .map((v) => Number(v))
    .find((v) => Number.isFinite(v) && v > 0)

  const totalCandidates = [payload?.total, payload?.totalCount]
  const total = totalCandidates
    .map((v) => Number(v))
    .find((v) => Number.isFinite(v) && v > 0)

  let pageCount = [payload?.pagecount, payload?.pageCount]
    .map((v) => Number(v))
    .find((v) => Number.isFinite(v) && v > 0 && v <= 999)

  if (!pageCount && total && limit) {
    pageCount = Math.ceil(total / limit)
  }

  return {
    page: page || fallbackPage,
    pageSize: limit || fallbackSize,
    total: total || list.length,
    pageCount: Math.max(1, pageCount || (list.length ? 1 : fallbackPage || 1)),
  }
}

export function normalizeVideoCard(raw, source) {
  return {
    id: String(raw?.vod_id || raw?.id || ''),
    name: String(raw?.vod_name || raw?.name || '').trim() || '未命名',
    pic: raw?.vod_pic || raw?.pic || '',
    remarks: String(raw?.vod_remarks || raw?.remarks || raw?.vod_score || '').trim(),
    sourceUid: raw?.source_uid || raw?.source_key || raw?.sourceKey || source?.uid || '',
    sourceName: String(raw?.source_name || raw?.sourceName || source?.name || '').trim(),
  }
}

export function classIdOf(item) {
  return String(item?.type_id || item?.typeId || item?.id || '')
}

export function classNameOf(item) {
  return String(item?.type_name || item?.typeName || item?.name || '').trim() || '未命名'
}

export function sanitizePlayableUrl(value) {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return raw

  if (/^(https?:\/\/|rtmp:\/\/|rtsp:\/\/|ftp:\/\/|magnet:|thunder:|ed2k:\/\/|\/\/)/i.test(raw) && raw.includes('/')) {
    return raw
  }

  const separators = ['@', ',', '，', '#', '|', ';', '~']
  for (const sep of separators) {
    if (!raw.includes(sep)) continue
    const parts = raw.split(sep)
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed && /^(https?:\/\/|rtmp:\/\/|rtsp:\/\/|\/\/)/i.test(trimmed) && trimmed.includes('/')) {
        return trimmed
      }
    }
  }

  return raw
}

function hasPlayableScheme(value) {
  return /^(https?:\/\/|rtmp:\/\/|rtsp:\/\/|ftp:\/\/|magnet:|thunder:|ed2k:\/\/|\/\/)/i.test(value || '')
}

function joinPlayableUrl(baseUrl, targetUrl) {
  const base = sanitizePlayableUrl(baseUrl)
  const target = sanitizePlayableUrl(targetUrl)
  if (!base) return target
  if (!target) return base
  if (hasPlayableScheme(target)) return target.startsWith('//') ? `https:${target}` : target
  if (target.startsWith('/')) {
    try { return new URL(target, base).toString() } catch { return `${base}${target}` }
  }
  return `${base}${target}`
}

function splitPlaylistRow(row) {
  const index = row.indexOf('$')
  if (index < 0) return { name: row.trim() || '立即播放', id: sanitizePlayableUrl(row) }
  return { name: row.slice(0, index).trim() || '立即播放', id: sanitizePlayableUrl(row.slice(index + 1)) }
}

export function parsePlayGroups(vod) {
  const flags = String(vod?.vod_play_from || '')
    .split('$$$')
    .map((s) => s.trim())
    .filter(Boolean)

  const lines = String(vod?.vod_play_url || '')
    .split('$$$')
    .map((s) => s.trim())

  return flags.map((flagName, flagIndex) => ({
    flag: flagName,
    name: flagName,
    index: flagIndex,
    episodes: String(lines[flagIndex] || '')
      .split('#')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(splitPlaylistRow),
  }))
}

export function normalizeDetail(payload, source) {
  const vod = normalizeList(payload)[0]
  if (!vod) return null

  return {
    id: String(vod?.vod_id || vod?.id || ''),
    name: String(vod?.vod_name || vod?.name || '').trim() || '未命名',
    pic: vod?.vod_pic || vod?.pic || '',
    desc: String(vod?.vod_content || vod?.vod_blurb || vod?.remarks || '').replace(/<[^>]+>/g, '').trim(),
    remarks: String(vod?.vod_remarks || '').trim(),
    type: String(vod?.type_name || vod?.vod_class || '').trim(),
    year: String(vod?.vod_year || '').trim(),
    area: String(vod?.vod_area || '').trim(),
    director: String(vod?.vod_director || '').trim(),
    actor: String(vod?.vod_actor || '').trim(),
    lang: String(vod?.vod_lang || '').trim(),
    sourceUid: source?.uid || '',
    sourceName: String(source?.name || '').trim(),
    sourceKey: source?.key || '',
    playGroups: parsePlayGroups(vod),
  }
}

export function buildPlayableUrl(playPayload, fallbackId) {
  const rawUrl = sanitizePlayableUrl(playPayload?.url || fallbackId)
  const playUrl = sanitizePlayableUrl(playPayload?.playUrl || '')

  if (Number(playPayload?.parse || 0) === 1 && playUrl) {
    return sanitizePlayableUrl(joinPlayableUrl(playUrl, rawUrl))
  }

  if (rawUrl.startsWith('//')) return `https:${rawUrl}`
  return sanitizePlayableUrl(rawUrl)
}

export function formatMeta(detail) {
  return [detail?.type, detail?.year, detail?.area, detail?.remarks].filter(Boolean).join(' · ')
}

export function formatHistoryTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 172800000) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function mergeVideosByName(videos, aiMapping) {
  const map = new Map()
  for (const v of videos) {
    const rawName = v.name?.trim()
    if (!rawName) continue
    const key = aiMapping?.[rawName] || rawName
    if (!map.has(key)) {
      map.set(key, {
        id: `group-${key}`,
        name: key,
        pic: v.pic || '',
        remarks: v.remarks || '',
        year: v.year || '',
        type: v.type || '',
        isGroup: true,
        sources: [{ uid: v.sourceUid, name: v.sourceName, vodId: v.id }],
      })
    } else {
      const existing = map.get(key)
      existing.sources.push({ uid: v.sourceUid, name: v.sourceName, vodId: v.id })
      if (!existing.pic && v.pic) existing.pic = v.pic
      if (!existing.remarks && v.remarks) existing.remarks = v.remarks
    }
  }
  return Array.from(map.values())
}
