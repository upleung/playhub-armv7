import axios from 'axios'
import { message } from 'antd'

const client = axios.create({
  baseURL: '/',
  timeout: 90000,
  withCredentials: true,
})

// Track if message handler is initialized
let messageInitialized = false

export function initMessageHandler() {
  if (messageInitialized) return
  messageInitialized = true

  client.interceptors.response.use(
    (res) => res,
    (err) => {
      if (isAbortError(err)) return Promise.reject(err)

      const msg =
        err.response?.data?.message ||
        (typeof err.response?.data === 'string' ? err.response.data : null) ||
        err.message ||
        '请求失败'

      // Don't show toast for "未加载配置" etc managed by components
      const status = err.response?.status || 0
      if (status === 400 && msg.includes('配置')) {
        // Config-related errors handled by components
      } else {
        message.error(msg, 3)
      }

      return Promise.reject(new Error(msg))
    }
  )
}

export async function getJson(url, config) {
  const res = await client.get(url, config)
  return res.data
}

export async function postJson(url, body, config) {
  const res = await client.post(url, body, config)
  return res.data
}

export function isAbortError(err) {
  return axios.isCancel(err) || err?.code === 'ERR_CANCELED'
}

export default client
