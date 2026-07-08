import { useEffect, useState } from 'react';
import { listApiKeys, setApiKey, deleteApiKey, activateApiKey } from '../../lib/env';
import { listAgents, updateAgentModel } from '../../lib/agents';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/dialog/ConfirmDialog';

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  siliconflow: 'SiliconFlow',
  kimi: 'Kimi',
  zhipu: '智谱',
  qwen: '通义千问',
  minimax: 'MiniMax',
  tavily: 'Tavily',
  baidu_api: '百度语音识别 API Key',
  baidu_secret: '百度语音识别 Secret Key',
};

const VISIBLE_PROVIDERS = ['deepseek', 'siliconflow', 'kimi', 'zhipu', 'qwen', 'minimax'];

const SEARCH_PROVIDERS = ['tavily'];

const SPEECH_PROVIDERS = ['baidu_api', 'baidu_secret'];

const GLOBAL_TABS = [
  { id: 'apikey', label: '模型 API Key' },
  { id: 'agent', label: 'Agent 模型' },
  { id: 'search', label: '搜索引擎' },
  { id: 'speech', label: '语音服务' },
];

const WORKSPACE_TABS = [
  { id: 'agent', label: 'Agent 模型' },
  { id: 'apikey', label: '模型 API Key' },
];

export default function SettingsModal({
  isOpen,
  onClose,
  onRequestConfirm,
  mode = 'global',
  workspace = null,
}) {
  const [keys, setKeys] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [baseUrlValue, setBaseUrlValue] = useState('');
  const [alertModal, setAlertModal] = useState({ open: false, message: '' });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, provider: '' });
  const [saving, setSaving] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [editingAgentProvider, setEditingAgentProvider] = useState('');
  const [editingAgentModelName, setEditingAgentModelName] = useState('');
  const [editingAgentBaseUrl, setEditingAgentBaseUrl] = useState('');
  const [agentSaving, setAgentSaving] = useState(false);
  const isWorkspaceMode = mode === 'workspace';
  const tabs = isWorkspaceMode ? WORKSPACE_TABS : GLOBAL_TABS;
  const defaultTab = isWorkspaceMode ? 'agent' : 'apikey';
  const [tab, setTab] = useState(defaultTab);

  const loadKeys = async () => {
    try {
      const data = await listApiKeys();
      setKeys(data.keys || []);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  };

  const loadAgents = async () => {
    try {
      const data = await listAgents();
      setAgents(data.agents || []);
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTab(defaultTab);
      Promise.all([loadKeys(), loadAgents()]).finally(() => setLoading(false));
    }
  }, [isOpen, defaultTab]);

  const openEditor = (key) => {
    if (editingKey === key.provider) {
      setEditingKey(null);
      setInputValue('');
      setBaseUrlValue('');
      return;
    }
    setEditingKey(key.provider);
    setInputValue('');
    setBaseUrlValue(key.base_url || '');
  };

  const handleSave = async (key) => {
    if (!inputValue.trim()) return;
    setSaving(true);
    try {
      await setApiKey(key.provider, inputValue.trim(), baseUrlValue.trim());
      setEditingKey(null);
      setInputValue('');
      setBaseUrlValue('');
      await loadKeys();
    } catch (error) {
      console.error('Failed to save API key:', error);
      setAlertModal({ open: true, message: '保存失败：' + error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAgent = async (agentName) => {
    setAgentSaving(true);
    try {
      await updateAgentModel(
        agentName,
        editingAgentProvider,
        editingAgentModelName,
        editingAgentBaseUrl
      );
      await loadAgents();
      setEditingAgent(null);
      setEditingAgentProvider('');
      setEditingAgentModelName('');
      setEditingAgentBaseUrl('');
    } catch (err) {
      setAlertModal({ open: true, message: '切换失败：' + err.message });
    } finally {
      setAgentSaving(false);
    }
  };

  const handleDelete = (provider) => {
    setDeleteConfirm({ open: true, provider });
  };

  const handleActivate = async (provider) => {
    try {
      await activateApiKey(provider);
      await loadKeys();
    } catch (error) {
      console.error('Failed to activate API key:', error);
      setAlertModal({ open: true, message: '设为默认失败：' + error.message });
    }
  };

  const confirmDelete = async () => {
    const provider = deleteConfirm.provider;
    setDeleteConfirm({ open: false, provider: '' });
    if (!provider) return;
    try {
      await deleteApiKey(provider);
      await loadKeys();
    } catch (error) {
      console.error('Failed to delete API key:', error);
      setAlertModal({ open: true, message: '删除失败：' + error.message });
    }
  };

  const handleKeyDown = (event, key) => {
    if (event.key === 'Enter') handleSave(key);
    if (event.key === 'Escape') {
      setEditingKey(null);
      setInputValue('');
      setBaseUrlValue('');
    }
  };

  const visibleKeys = keys.filter((key) => VISIBLE_PROVIDERS.includes(key.provider));
  const modelKeys = visibleKeys.filter((key) => key.category === 'model');
  const searchKeys = keys.filter((key) => key.category === 'search' && SEARCH_PROVIDERS.includes(key.provider));
  const speechKeys = keys.filter((key) => key.category === 'speechToText');

  const renderTabNav = () => (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '20px',
        paddingBottom: '12px',
      }}
    >
      {tabs.map((t) => {
        const isActive = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              border: '1px solid',
              borderColor: isActive ? '#10b981' : '#e5e7eb',
              borderRadius: '6px',
              backgroundColor: isActive ? '#d1fae5' : '#ffffff',
              color: isActive ? '#065f46' : '#374151',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const renderApiKeyTab = () => (
    <>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>加载中...</div>
      ) : modelKeys.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>暂无可用的模型配置</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {modelKeys.map((key) => (
            <div
              key={key.provider}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px',
                backgroundColor: '#ffffff',
              }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--tx-normal)' }}>
                      {PROVIDER_LABELS[key.provider] || key.provider}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>{key.provider}</div>
                    {key.key_preview && (
                      <div style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
                        {key.key_preview}
                      </div>
                    )}
                    {key.base_url && (
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Base URL: {key.base_url}</div>
                    )}
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '10px',
                        fontSize: '13px',
                        color: key.has_value ? (key.is_active ? '#065f46' : '#374151') : '#9ca3af',
                        cursor: key.has_value ? 'pointer' : 'not-allowed',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="radio"
                        name="default-model-provider"
                        checked={!!key.is_active}
                        disabled={!key.has_value}
                        onChange={() => {
                          if (!key.has_value || key.is_active) return;
                          handleActivate(key.provider);
                        }}
                      />
                      <span>{key.is_active ? '当前默认模型' : '设为默认模型'}</span>
                    </label>
                  </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: key.has_value ? '#d1fae5' : '#f3f4f6',
                      color: key.has_value ? '#065f46' : '#9ca3af',
                    }}
                  >
                    {key.has_value ? '已配置' : '未配置'}
                  </span>
                  <button
                    onClick={() => openEditor(key)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      color: 'var(--tx-normal)',
                      cursor: 'pointer',
                    }}
                  >
                    {key.has_value ? '修改' : '设置'}
                  </button>
                  {key.has_value && (
                    <button
                      onClick={() => handleDelete(key.provider)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        cursor: 'pointer',
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>

              {editingKey === key.provider && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="password"
                    placeholder={`输入 ${PROVIDER_LABELS[key.provider] || key.provider} API Key...`}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, key)}
                    autoFocus
                    style={{
                      padding: '8px',
                      fontSize: '13px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      width: '100%',
                      backgroundColor: '#ffffff',
                      color: 'var(--tx-normal)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="输入 Base URL（可选）"
                    value={baseUrlValue}
                    onChange={(e) => setBaseUrlValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, key)}
                    style={{
                      padding: '8px',
                      fontSize: '13px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      width: '100%',
                      backgroundColor: '#ffffff',
                      color: 'var(--tx-normal)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setEditingKey(null);
                        setInputValue('');
                        setBaseUrlValue('');
                      }}
                      style={{
                        padding: '6px 16px',
                        fontSize: '13px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        backgroundColor: '#ffffff',
                        color: 'var(--tx-normal)',
                        cursor: 'pointer',
                      }}
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleSave(key)}
                      disabled={saving || !inputValue.trim()}
                      style={{
                        padding: '6px 16px',
                        fontSize: '13px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: saving || !inputValue.trim() ? '#e5e7eb' : '#10b981',
                        color: saving || !inputValue.trim() ? '#9ca3af' : 'white',
                        cursor: saving || !inputValue.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: '#eff6ff',
          borderRadius: '4px',
          fontSize: '13px',
          color: '#1e40af',
          lineHeight: '1.6',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>💡 提示</div>
        <div>• 配置至少一个模型的 API Key 后才能使用对话功能</div>
        <div>• 这里维护的是全局模型服务连接信息</div>
        <div>• 默认模型有且只有一个，新建 Moss 和普通 Agent 时会优先写入它</div>
        <div>• Agent 模型配置是全局级别的，与具体 session 无关</div>
      </div>
    </>
  );

  const renderSearchTab = () => (
    <>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>加载中...</div>
      ) : searchKeys.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>暂无可用的搜索引擎配置</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {searchKeys.map((key) => (
            <div
              key={key.provider}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px',
                backgroundColor: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--tx-normal)' }}>
                    {PROVIDER_LABELS[key.provider] || key.provider}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>{key.provider}</div>
                  {key.key_preview && (
                    <div style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
                      {key.key_preview}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: key.has_value ? '#d1fae5' : '#f3f4f6',
                      color: key.has_value ? '#065f46' : '#9ca3af',
                    }}
                  >
                    {key.has_value ? '已配置' : '未配置'}
                  </span>
                  <button
                    onClick={() => openEditor(key)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      color: 'var(--tx-normal)',
                      cursor: 'pointer',
                    }}
                  >
                    {key.has_value ? '修改' : '设置'}
                  </button>
                  {key.has_value && (
                    <button
                      onClick={() => handleDelete(key.provider)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        cursor: 'pointer',
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>

              {editingKey === key.provider && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="password"
                    placeholder={`输入 ${PROVIDER_LABELS[key.provider] || key.provider} API Key...`}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, key)}
                    autoFocus
                    style={{
                      padding: '8px',
                      fontSize: '13px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      width: '100%',
                      backgroundColor: '#ffffff',
                      color: 'var(--tx-normal)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setEditingKey(null);
                        setInputValue('');
                        setBaseUrlValue('');
                      }}
                      style={{
                        padding: '6px 16px',
                        fontSize: '13px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        backgroundColor: '#ffffff',
                        color: 'var(--tx-normal)',
                        cursor: 'pointer',
                      }}
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleSave(key)}
                      disabled={saving || !inputValue.trim()}
                      style={{
                        padding: '6px 16px',
                        fontSize: '13px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: saving || !inputValue.trim() ? '#e5e7eb' : '#10b981',
                        color: saving || !inputValue.trim() ? '#9ca3af' : 'white',
                        cursor: saving || !inputValue.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: '#eff6ff',
          borderRadius: '4px',
          fontSize: '13px',
          color: '#1e40af',
          lineHeight: '1.6',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>💡 提示</div>
        <div>• 语音服务需要同时配置 `baidu_api` 和 `baidu_secret`</div>
        <div>• 缺少任意一个 key，相关对话框就无法启动语音能力</div>
        <div>• 搜索引擎 key 目前用于 Web Search 能力</div>
        <div>• 没有配置时，相关搜索工具将不可用</div>
      </div>
    </>
  );

  const renderAgentTab = () => {
    const workspaceAgentNames = new Set([
      ...(workspace?.agents || []).map((agent) => agent?.name),
    ].filter(Boolean));
    const workspaceAgentList = isWorkspaceMode
      ? agents.filter((agent) => workspaceAgentNames.has(agent.display_name || agent.name))
      : agents;

    return (
      <>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>加载中...</div>
        ) : workspaceAgentList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
            {isWorkspaceMode ? '当前工作空间暂无可配置 Agent' : '暂无可配置的全局 Agent'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {workspaceAgentList.map((agent) => {
              const configuredModelProviders = keys.filter((k) => k.category === 'model' && k.has_value);
              const isConfigured = !!agent.model_provider;
              return (
              <div
                key={agent.name}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--tx-normal)' }}>
                      {agent.display_name || agent.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                      {isConfigured
                        ? `${PROVIDER_LABELS[agent.model_provider] || agent.model_provider} / ${agent.model_name || '默认模型'}`
                        : '⚠️ 尚未配置模型'}
                    </div>
                  </div>
                  <div>
                    {editingAgent === agent.name ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '280px' }}>
                        <select
                          value={editingAgentProvider}
                          onChange={(e) => {
                            const provider = e.target.value;
                            setEditingAgentProvider(provider);
                            const keyInfo = keys.find((k) => k.provider === provider);
                            if (keyInfo) {
                              setEditingAgentModelName(keyInfo.model_name || '');
                              setEditingAgentBaseUrl(keyInfo.base_url || '');
                            }
                          }}
                          disabled={agentSaving}
                          style={{
                            padding: '6px',
                            fontSize: '13px',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <option value="">选择模型...</option>
                          {VISIBLE_PROVIDERS.map((p) => {
                            const hasKey = configuredModelProviders.some((k) => k.provider === p);
                            return (
                              <option key={p} value={p} disabled={!hasKey}>
                                {PROVIDER_LABELS[p] || p} {!hasKey && '(未配置)'}
                              </option>
                            );
                          })}
                        </select>
                        <input
                          type="text"
                          placeholder="模型名称（可选）"
                          value={editingAgentModelName}
                          onChange={(e) => setEditingAgentModelName(e.target.value)}
                          style={{
                            padding: '6px',
                            fontSize: '13px',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Base URL（可选）"
                          value={editingAgentBaseUrl}
                          onChange={(e) => setEditingAgentBaseUrl(e.target.value)}
                          style={{
                            padding: '6px',
                            fontSize: '13px',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setEditingAgent(null)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '4px',
                              background: '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            取消
                          </button>
                          <button
                            onClick={() => {
                              if (!editingAgentProvider) return;
                              if (!onRequestConfirm) {
                                handleSaveAgent(agent.name);
                                return;
                              }
                              onRequestConfirm({
                                title: '切换模型确认',
                                message: (
                                  <>
                                    确认切换模型吗？
                                    <br /><br />
                                    <strong>• 切换后需要刷新页面才能生效</strong>
                                    <br />
                                    <strong>• 切换后可能导致上下文不兼容</strong>
                                  </>
                                ),
                                confirmLabel: '确认切换',
                                action: async () => {
                                  await handleSaveAgent(agent.name);
                                },
                              });
                            }}
                            disabled={agentSaving || !editingAgentProvider}
                            style={{
                              padding: '4px 12px',
                              fontSize: '12px',
                              border: 'none',
                              borderRadius: '4px',
                              backgroundColor: agentSaving || !editingAgentProvider ? '#e5e7eb' : '#10b981',
                              color: agentSaving || !editingAgentProvider ? '#9ca3af' : 'white',
                              cursor: agentSaving || !editingAgentProvider ? 'not-allowed' : 'pointer',
                            }}
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingAgent(agent.name);
                          setEditingAgentProvider(agent.model_provider || '');
                          setEditingAgentModelName(agent.model_name || '');
                          setEditingAgentBaseUrl(agent.base_url || '');
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '13px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          backgroundColor: '#ffffff',
                          color: 'var(--tx-normal)',
                          cursor: 'pointer',
                        }}
                      >
                        {isConfigured ? '切换模型' : '选择模型'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

const renderSpeechTab = () => (
    <>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>加载中...</div>
      ) : speechKeys.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>暂无可用的语音配置</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {speechKeys.map((key) => (
            <div
              key={key.provider}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px',
                backgroundColor: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--tx-normal)' }}>
                    {PROVIDER_LABELS[key.provider] || key.provider}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>{key.provider}</div>
                  {key.key_preview && (
                    <div style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
                      {key.key_preview}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: key.has_value ? '#d1fae5' : '#f3f4f6',
                      color: key.has_value ? '#065f46' : '#9ca3af',
                    }}
                  >
                    {key.has_value ? '已配置' : '未配置'}
                  </span>
                  <button
                    onClick={() => openEditor(key)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      color: 'var(--tx-normal)',
                      cursor: 'pointer',
                    }}
                  >
                    {key.has_value ? '修改' : '设置'}
                  </button>
                  {key.has_value && (
                    <button
                      onClick={() => handleDelete(key.provider)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        cursor: 'pointer',
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>

              {editingKey === key.provider && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="password"
                    placeholder={`输入 ${PROVIDER_LABELS[key.provider] || key.provider} Key...`}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, key)}
                    autoFocus
                    style={{
                      padding: '8px',
                      fontSize: '13px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      width: '100%',
                      backgroundColor: '#ffffff',
                      color: 'var(--tx-normal)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setEditingKey(null);
                        setInputValue('');
                        setBaseUrlValue('');
                      }}
                      style={{
                        padding: '6px 16px',
                        fontSize: '13px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        backgroundColor: '#ffffff',
                        color: 'var(--tx-normal)',
                        cursor: 'pointer',
                      }}
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleSave(key)}
                      disabled={saving || !inputValue.trim()}
                      style={{
                        padding: '6px 16px',
                        fontSize: '13px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: saving || !inputValue.trim() ? '#e5e7eb' : '#10b981',
                        color: saving || !inputValue.trim() ? '#9ca3af' : 'white',
                        cursor: saving || !inputValue.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: '#eff6ff',
          borderRadius: '4px',
          fontSize: '13px',
          color: '#1e40af',
          lineHeight: '1.6',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>💡 提示</div>
        <div>• 语音服务需要同时配置 `baidu_api` 和 `baidu_secret`</div>
        <div>• 缺少任意一个 key，相关对话框就无法启动语音能力</div>
      </div>
    </>
  );

  const renderTabContent = () => {
    switch (tab) {
      case 'apikey':
        return renderApiKeyTab();
      case 'search':
        return renderSearchTab();
      case 'agent':
        return renderAgentTab();
      case 'speech':
        return renderSpeechTab();
      default:
        return null;
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div style={{ padding: '20px', minWidth: '600px', maxHeight: '70vh', overflow: 'auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>设置</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        {renderTabNav()}
        {renderTabContent()}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="确认删除"
        message="确定要删除这个 API Key 吗？"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, provider: '' })}
      />

      <Modal open={alertModal.open} onClose={() => setAlertModal({ open: false, message: '' })}>
        <div style={{ padding: '24px', minWidth: 280 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#111827' }}>提示</h3>
          <p style={{ margin: '0 0 20px 0', fontSize: 14, color: '#4b5563', lineHeight: 1.5 }}>
            {alertModal.message}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="primary-btn compact"
              onClick={() => setAlertModal({ open: false, message: '' })}
              style={{ minWidth: 80 }}
            >
              确定
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}


