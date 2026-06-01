import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/global.css'
import { initMessageHandler } from './api/client'

initMessageHandler()

const theme = {
  token: {
    colorPrimary: '#1677ff',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f8ff',
    colorBgElevated: '#ffffff',
    colorText: '#1a1a2e',
    colorTextSecondary: '#6b7280',
    colorBorder: '#e5e7eb',
    colorBorderSecondary: '#f0f0f0',
    borderRadius: 12,
    fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 14,
    controlHeight: 40,
    colorLink: '#1677ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    boxShadowSecondary: '0 4px 16px rgba(0,0,0,0.08)',
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 40,
      paddingInline: 20,
    },
    Card: {
      borderRadius: 16,
      paddingLG: 24,
    },
    Input: {
      borderRadius: 10,
      controlHeight: 44,
    },
    Select: {
      borderRadius: 10,
      controlHeight: 44,
    },
    Tag: {
      borderRadius: 6,
    },
    Tabs: {
      borderRadius: 8,
    },
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ConfigProvider locale={zhCN} theme={theme}>
    <App />
  </ConfigProvider>
)
