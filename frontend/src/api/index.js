import { getJson, postJson } from './client'

export function loadConfig(url) {
  return postJson('/api/config/load', { url })
}

export function getConfig() {
  return getJson('/api/config')
}

export function getHealth() {
  return getJson('/api/health')
}

export function sourceHome(key) {
  return getJson(`/api/source/${encodeURIComponent(key)}/home`, {
    params: { filter: true },
  })
}

export function sourceCategory(key, tid, pg = 1, extend = {}) {
  return postJson(`/api/source/${encodeURIComponent(key)}/category`, {
    tid,
    pg: String(pg),
    filter: true,
    extend,
  })
}

export function sourceSearch(key, wd, quick = false, config = {}) {
  return getJson(`/api/source/${encodeURIComponent(key)}/search`, {
    params: { wd, quick },
    ...config,
  })
}

export function sourceDetail(key, id, config = {}) {
  return getJson(`/api/source/${encodeURIComponent(key)}/detail`, {
    params: { id },
    ...config,
  })
}

export function sourcePlay(key, flag, id) {
  return getJson(`/api/source/${encodeURIComponent(key)}/play`, {
    params: { flag, id },
  })
}

export function searchAll(wd, quick = false) {
  return getJson('/api/search/all', {
    params: { wd, quick },
  })
}

export function liveBootstrap(playlistUrl, epgUrl) {
  return postJson('/api/live/bootstrap', { playlistUrl, epgUrl })
}

export function batchDetail(items) {
  return postJson('/api/batch/detail', { items })
}

export function getProgress(id) {
  return getJson(`/api/progress/${id}`)
}
