import React, { useState, useRef } from 'react'
import { Form, Input, Button, Select, Space, Divider, Typography, message, List, Popconfirm, AutoComplete, Switch, Modal } from 'antd'
import { DeleteOutlined, LinkOutlined, HistoryOutlined, ClockCircleOutlined, RobotOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, ExportOutlined, ImportOutlined, LockOutlined } from '@ant-design/icons'
import { useStore } from '../stores/useStore'

const { Text, Title } = Typography

export default function SettingsDrawer({ onClose }) {
  const store = useStore()
  const [configInput, setConfigInput] = useState(store.configUrl || '')
  const [loading, setLoading] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState(null)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [importPassword, setImportPassword] = useState('')
  const [importData, setImportData] = useState('')
  const fileInputRef = useRef(null)

  const handleLoadConfig = async (url) => {
    const target = (url || configInput).trim()
    if (!target) { message.warning('请输入配置地址'); return }
    setLoading(true)
    try {
      await store.loadConfig(target)
      setConfigInput(target)
      message.success('配置加载成功')
    } catch (err) {
      message.error('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const historyOptions = store.configHistory.map((url) => ({
    value: url,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClockCircleOutlined style={{ color: '#999', fontSize: 12 }} />
        <Text ellipsis style={{ flex: 1, fontSize: 13 }}>{url}</Text>
      </div>
    ),
  }))

  const handleTestAi = async () => {
    const { aiUrl, aiKey, aiModel } = store.settings
    if (!aiUrl || !aiKey) { message.warning('请先填写 AI 接口地址和 API Key'); return }
    setAiTesting(true)
    setAiTestResult(null)
    try {
      const res = await fetch(`${aiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
        body: JSON.stringify({ model: aiModel || 'gpt-4o-mini', messages: [{ role: 'user', content: '回复"OK"' }], max_tokens: 10 }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.choices?.[0]?.message?.content) {
        setAiTestResult({ ok: true, model: data.model || aiModel })
      } else {
        setAiTestResult({ ok: false, error: '返回格式异常' })
      }
    } catch (err) {
      setAiTestResult({ ok: false, error: err.message })
    } finally {
      setAiTesting(false)
    }
  }

  const encryptData = (data, password) => {
    const jsonStr = JSON.stringify(data)
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)))
    if (!password) return encoded
    // Simple XOR encryption with password
    let result = ''
    for (let i = 0; i < encoded.length; i++) {
      result += String.fromCharCode(encoded.charCodeAt(i) ^ password.charCodeAt(i % password.length))
    }
    return btoa(result)
  }

  const decryptData = (encrypted, password) => {
    try {
      if (!password) {
        return JSON.parse(decodeURIComponent(escape(atob(encrypted))))
      }
      const decoded = atob(encrypted)
      let result = ''
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ password.charCodeAt(i % password.length))
      }
      return JSON.parse(decodeURIComponent(escape(atob(result))))
    } catch {
      throw new Error('解密失败，密码可能不正确')
    }
  }

  const handleExport = () => {
    if (!exportPassword) { message.warning('请设置配置密码'); return }
    const configData = {
      configUrl: store.configUrl,
      settings: store.settings,
      configHistory: store.configHistory,
      searchHistory: store.searchHistory,
    }
    const encrypted = encryptData(configData, exportPassword)
    const blob = new Blob([encrypted], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `playhub-config-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    message.success('配置已导出')
    setExportModalOpen(false)
    setExportPassword('')
  }

  const handleImport = () => {
    if (!importData.trim()) { message.warning('请粘贴配置数据'); return }
    if (!importPassword) { message.warning('请输入配置密码'); return }
    try {
      const configData = decryptData(importData.trim(), importPassword)
      if (configData.configUrl) {
        store.loadConfig(configData.configUrl)
      }
      if (configData.settings) {
        store.updateSettings(configData.settings)
      }
      if (configData.configHistory) {
        // Merge config history
        const merged = [...new Set([...configData.configHistory, ...store.configHistory])].slice(0, 10)
        store.configHistory = merged
        localStorage.setItem('playhub:config-history', JSON.stringify(merged))
      }
      message.success('配置导入成功')
      setImportModalOpen(false)
      setImportPassword('')
      setImportData('')
    } catch (err) {
      message.error(err.message || '导入失败')
    }
  }

  const handleFileImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImportData(ev.target.result)
    }
    reader.readAsText(file)
    e.target.value = '' // Reset file input
  }

  return (
    <div>
      <Title level={5} style={{ marginBottom: 16 }}>数据源配置</Title>
      <Form layout="vertical">
        <Form.Item label="配置地址" style={{ marginBottom: 12 }}>
          <Space.Compact style={{ width: '100%' }}>
            <AutoComplete
              value={configInput}
              options={historyOptions}
              onChange={setConfigInput}
              onSelect={(val) => { setConfigInput(val); handleLoadConfig(val) }}
              style={{ flex: 1 }}
            >
              <Input prefix={<LinkOutlined />} placeholder="输入 TVBox 配置 JSON 地址" onPressEnter={() => handleLoadConfig()} />
            </AutoComplete>
            <Button type="primary" loading={loading} onClick={() => handleLoadConfig()}>加载</Button>
          </Space.Compact>
        </Form.Item>
      </Form>

      {store.configHistory.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <HistoryOutlined style={{ color: '#999', fontSize: 13 }} />
            <Text type="secondary" style={{ fontSize: 13 }}>历史配置</Text>
          </div>
          <List
            size="small"
            dataSource={store.configHistory}
            renderItem={(url) => (
              <List.Item
                style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 4, background: store.configUrl === url ? '#e6f4ff' : '#fafafa', border: store.configUrl === url ? '1px solid #91caff' : '1px solid #f0f0f0', cursor: 'pointer', transition: 'all 0.2s ease' }}
                onClick={() => { setConfigInput(url); handleLoadConfig(url) }}
                actions={[
                  <Popconfirm title="确定删除？" onConfirm={(e) => { e?.stopPropagation(); store.removeConfigHistory(url) }} onCancel={(e) => e?.stopPropagation()}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={<Text ellipsis style={{ maxWidth: 260, fontSize: 13, fontWeight: store.configUrl === url ? 600 : 400 }}>{url}</Text>}
                  description={store.configUrl === url ? <Text style={{ fontSize: 11, color: '#52c41a' }}>当前使用</Text> : null}
                />
              </List.Item>
            )}
          />
        </>
      )}

      <Divider />

      <Title level={5} style={{ marginBottom: 16 }}>搜索设置</Title>
      <Form layout="vertical">
        <Form.Item label="搜索范围">
          <Select
            value={store.settings.searchScope}
            onChange={(v) => store.updateSettings({ searchScope: v })}
            options={[
              { label: '全部源', value: 'all' },
              { label: '当前源', value: 'current' },
            ]}
          />
        </Form.Item>
      </Form>

      <Divider />

      <Title level={5} style={{ marginBottom: 16 }}>
        <RobotOutlined style={{ marginRight: 8 }} />
        AI 增强
      </Title>
      <Form layout="vertical">
        <Form.Item label="启用 AI 增强">
          <Switch
            checked={store.settings.aiEnabled}
            onChange={(v) => store.updateSettings({ aiEnabled: v })}
          />
          <Text type="secondary" style={{ marginLeft: 12, fontSize: 13 }}>
            使用 AI 增强您的视频播放体验
          </Text>
        </Form.Item>
        {store.settings.aiEnabled && (
          <>
            <Form.Item label="AI 接口地址">
              <Input
                placeholder="如: https://api.openai.com"
                value={store.settings.aiUrl}
                onChange={(e) => store.updateSettings({ aiUrl: e.target.value })}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                仅支持 OpenAI completions 模式，填写 baseURL，域名后不加 /
              </Text>
            </Form.Item>
            <Form.Item label="模型 ID">
              <Input
                placeholder="如: gpt-4o-mini, deepseek-chat"
                value={store.settings.aiModel}
                onChange={(e) => store.updateSettings({ aiModel: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="API Key">
              <Input.Password
                placeholder="sk-..."
                value={store.settings.aiKey}
                onChange={(e) => store.updateSettings({ aiKey: e.target.value })}
              />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button
                  icon={aiTesting ? <LoadingOutlined /> : undefined}
                  loading={aiTesting}
                  onClick={handleTestAi}
                >
                  测试连接
                </Button>
                {aiTestResult && (
                  aiTestResult.ok ? (
                    <Text style={{ color: '#52c41a', fontSize: 13 }}>
                      <CheckCircleOutlined style={{ marginRight: 4 }} />
                      连接成功 {aiTestResult.model && `(${aiTestResult.model})`}
                    </Text>
                  ) : (
                    <Text style={{ color: '#ff4d4f', fontSize: 13 }}>
                      <CloseCircleOutlined style={{ marginRight: 4 }} />
                      {aiTestResult.error}
                    </Text>
                  )
                )}
              </Space>
            </Form.Item>
          </>
        )}
      </Form>

      <Divider />

      <Title level={5} style={{ marginBottom: 16 }}>直播设置</Title>
      <Form layout="vertical">
        <Form.Item label="直播源地址">
          <Input
            placeholder="输入 M3U 直播源地址"
            value={store.settings.liveSourceUrl}
            onChange={(e) => store.updateSettings({ liveSourceUrl: e.target.value })}
          />
        </Form.Item>
        <Form.Item label="EPG 地址 (可选)">
          <Input
            placeholder="输入 EPG XML 地址"
            value={store.settings.liveEpgUrl}
            onChange={(e) => store.updateSettings({ liveEpgUrl: e.target.value })}
          />
        </Form.Item>
      </Form>

      {store.sources.length > 0 && (
        <>
          <Divider />
          <Title level={5} style={{ marginBottom: 16 }}>已加载源 ({store.sources.length})</Title>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {store.sources.map((s) => (
              <div
                key={s.uid}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: store.selectedSourceUid === s.uid ? '#e6f4ff' : '#f5f5f5',
                  border: `1px solid ${store.selectedSourceUid === s.uid ? '#91caff' : '#e8e8e8'}`,
                  fontSize: 13,
                  color: store.selectedSourceUid === s.uid ? '#1677ff' : '#666',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => store.selectSource(s.uid)}
              >
                {s.name}
              </div>
            ))}
          </div>
        </>
      )}

      <Divider />

      <Title level={5} style={{ marginBottom: 16 }}>
        <LockOutlined style={{ marginRight: 8 }} />
        配置导入导出
      </Title>
      <Space>
        <Button icon={<ExportOutlined />} onClick={() => setExportModalOpen(true)}>
          导出配置
        </Button>
        <Button icon={<ImportOutlined />} onClick={() => setImportModalOpen(true)}>
          导入配置
        </Button>
      </Space>

      <Modal
        title="导出配置"
        open={exportModalOpen}
        onOk={handleExport}
        onCancel={() => { setExportModalOpen(false); setExportPassword('') }}
        okText="导出"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="设置配置密码" required>
            <Input.Password
              placeholder="设置密码用于加密配置"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              prefix={<LockOutlined />}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            导出的配置包含：配置地址、搜索设置、AI 设置、直播设置、历史配置
          </Text>
        </Form>
      </Modal>

      <Modal
        title="导入配置"
        open={importModalOpen}
        onOk={handleImport}
        onCancel={() => { setImportModalOpen(false); setImportPassword(''); setImportData('') }}
        okText="导入"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="配置密码">
            <Input.Password
              placeholder="输入导出时设置的密码"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              prefix={<LockOutlined />}
            />
          </Form.Item>
          <Form.Item label="配置数据">
            <Input.TextArea
              placeholder="粘贴配置数据，或点击下方按钮导入文件"
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              rows={4}
            />
          </Form.Item>
          <Button onClick={() => fileInputRef.current?.click()}>
            从文件导入
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            style={{ display: 'none' }}
            onChange={handleFileImport}
          />
        </Form>
      </Modal>
    </div>
  )
}
