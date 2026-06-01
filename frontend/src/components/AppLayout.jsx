import React, { useEffect, useState } from 'react'
import { Layout, Menu, Button, Drawer, Space, Typography, Badge } from 'antd'
import {
  HomeOutlined,
  HistoryOutlined,
  VideoCameraOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import SettingsDrawer from './SettingsDrawer'

const { Sider, Content, Header } = Layout
const { Text } = Typography

const navItems = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/history', icon: <HistoryOutlined />, label: '历史' },
  { key: '/live', icon: <VideoCameraOutlined />, label: '直播' },
]

export default function AppLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const bootstrap = useStore((s) => s.bootstrap)
  const history = useStore((s) => s.history)
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  const [error, setError] = useState(null)

  useEffect(() => {
    bootstrap().catch((err) => {
      console.error('Bootstrap error:', err)
      setError(err.message)
    })
  }, [bootstrap])

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isPlayerPage = location.pathname === '/player'

  if (isPlayerPage) {
    return (
      <Layout style={{ minHeight: '100vh', background: '#000' }}>
        <Content>{children}</Content>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout style={{ minHeight: '100vh', background: '#f5f8ff' }}>
        <Content style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Title level={3} style={{ color: '#ff4d4f' }}>加载出错</Title>
            <Text type="secondary">{error}</Text>
            <br /><br />
            <Button type="primary" onClick={() => window.location.reload()}>刷新页面</Button>
          </div>
        </Content>
      </Layout>
    )
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!mobile && (
        <Sider
          width={220}
          collapsedWidth={72}
          collapsed={collapsed}
          style={{
            background: '#fff',
            borderRight: '1px solid #f0f0f0',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: collapsed ? '20px 12px' : '20px 20px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              transition: 'all 0.25s ease',
            }}
            onClick={() => navigate('/')}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #1677ff, #4096ff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PlayCircleOutlined style={{ color: '#fff', fontSize: 20 }} />
            </div>
            {!collapsed && (
              <Text strong style={{ fontSize: 18, color: '#1a1a2e', letterSpacing: -0.5 }}>
                PlayHub
              </Text>
            )}
          </div>

          <div style={{ flex: 1, padding: '12px 8px' }}>
            <Menu
              mode="inline"
              selectedKeys={[location.pathname]}
              items={navItems}
              onClick={({ key }) => navigate(key)}
              style={{ border: 'none', background: 'transparent' }}
            />
          </div>

          <div style={{ padding: '12px 8px', borderTop: '1px solid #f0f0f0' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <Button
                type="text"
                icon={<HistoryOutlined />}
                block
                onClick={() => navigate('/history')}
                style={{ textAlign: collapsed ? 'center' : 'left', position: 'relative' }}
              >
                {!collapsed && '观看记录'}
                {history.length > 0 && (
                  <span style={{
                    marginLeft: 8,
                    background: '#1677ff',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '0 6px',
                    fontSize: 11,
                    lineHeight: '18px',
                    display: 'inline-block',
                  }}>
                    {history.length}
                  </span>
                )}
              </Button>
              <Button
                type="text"
                icon={<SettingOutlined />}
                block
                onClick={() => setSettingsOpen(true)}
                style={{ textAlign: collapsed ? 'center' : 'left' }}
              >
                {!collapsed && '设置'}
              </Button>
            </Space>
          </div>
        </Sider>
      )}

      <Layout style={{ marginLeft: mobile ? 0 : collapsed ? 72 : 220, transition: 'margin-left 0.25s ease' }}>
        {mobile && (
          <Header
            style={{
              background: '#fff',
              borderBottom: '1px solid #f0f0f0',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              zIndex: 99,
              height: 56,
            }}
          >
            <Space>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #1677ff, #4096ff)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PlayCircleOutlined style={{ color: '#fff', fontSize: 18 }} />
              </div>
              <Text strong style={{ fontSize: 16 }}>PlayHub</Text>
            </Space>
            <Space>
              <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} />
            </Space>
          </Header>
        )}

        {!mobile && (
          <div
            style={{
              position: 'fixed',
              left: collapsed ? 72 : 220,
              top: 12,
              zIndex: 101,
              transition: 'left 0.25s ease',
            }}
          >
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: '#fff',
                border: '1px solid #f0f0f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            />
          </div>
        )}

        <Content style={{ minHeight: '100vh' }}>
          {children}
        </Content>

        {mobile && (
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: '#fff',
              borderTop: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: 'space-around',
              padding: '6px 0',
              zIndex: 100,
            }}
          >
            {navItems.map((item) => (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '4px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: location.pathname === item.key ? '#1677ff' : '#6b7280',
                  background: location.pathname === item.key ? '#e6f4ff' : 'transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 500 }}>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </Layout>

      <Drawer
        title="设置"
        placement="right"
        width={mobile ? '100%' : 480}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      >
        <SettingsDrawer onClose={() => setSettingsOpen(false)} />
      </Drawer>
    </Layout>
  )
}
