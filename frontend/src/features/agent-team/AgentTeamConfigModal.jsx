import { useEffect, useMemo, useState } from "react";
import { CircleHelp, FolderOpen, GitBranch, Sparkles, Trash2 } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { Tooltip } from "../../components/common/Tooltip";
import { AgentWorkingDirModal } from "../modals/AgentWorkingDirModal";
import { PersonaResourceBrowser } from "../persona/PersonaResourceBrowser";
import { api } from "../../lib/api";
import { listApiKeys } from "../../lib/env";

const CONFIG_TABS = [
  { id: "basic", label: "基本信息" },
  { id: "model", label: "模型" },
  { id: "prompt", label: "提示词" },
  { id: "skills", label: "技能" },
  { id: "persona", label: "专家人格" },
  { id: "subagents", label: "子Agent" },
];

function normalizeConfigTab(tabId) {
  // 外部入口可能传来旧值或空值，这里统一兜底到 basic，避免弹窗落到不存在的 tab。
  return CONFIG_TABS.some((tab) => tab.id === tabId) ? tabId : "basic";
}

const PROVIDER_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  siliconflow: "SiliconFlow",
  kimi: "Kimi",
  zhipu: "智谱",
  qwen: "通义千问",
  minimax: "MiniMax",
};

const VISIBLE_PROVIDERS = ["deepseek", "siliconflow", "kimi", "zhipu", "qwen", "minimax"];
const COLLABORATOR_MODE_TIP = "协作者：子agent拥有独立的记忆，可以记得你之前委派的任务，但是子agent无法并发执行任务。";
const EXECUTOR_MODE_TIP = "执行器：子Agent可以并发执行任务，但是没有记忆，执行完毕之后，下一次他不知道之前做过什么。";

export function AgentTeamConfigModal({
  open,
  agent,
  allAgents = [],
  subagents = [],
  subagentsLoading = false,
  subagentsSaving = false,
  personas,
  form,
  initialTab = "basic",
  saving,
  error,
  onChange,
  onClose,
  onSaveBasic,
  onSaveModel,
  onSavePersona,
  onCreateSubagent,
  onDeleteSubagent,
  currentSubagentMode = null,
  onChangeSubagentMode,
  subagentModeSaving = false,
}) {
  const [selectedPersonaName, setSelectedPersonaName] = useState(form.persona_name || "");
  const normalizedInitialTab = normalizeConfigTab(initialTab);
  const [activeTab, setActiveTab] = useState(normalizedInitialTab);
  const [selectedPromptKey, setSelectedPromptKey] = useState("agent");
  const [selectedSkillName, setSelectedSkillName] = useState("");
  const [subagentForm, setSubagentForm] = useState({
    child_agent_id: "",
    description: "",
  });
  const [subagentFormError, setSubagentFormError] = useState("");
  const [workingDirModalOpen, setWorkingDirModalOpen] = useState(false);
  const [openPathError, setOpenPathError] = useState("");
  const [modelKeys, setModelKeys] = useState([]);
  const [modelKeysLoading, setModelKeysLoading] = useState(false);
  const [modelKeysError, setModelKeysError] = useState("");

  useEffect(() => {
    setSelectedPersonaName(form.persona_name || "");
  }, [form.persona_name, open]);

  useEffect(() => {
    if (!open) return;
    setActiveTab(normalizedInitialTab);
  }, [open, normalizedInitialTab]);

  useEffect(() => {
    const firstPrompt = agent?.base_resources?.prompt_resources?.find((item) => item.key === "agent")
      || agent?.base_resources?.prompt_resources?.[0]
      || null;
    setSelectedPromptKey(firstPrompt?.key || "");

    const firstSkill = agent?.base_resources?.runtime_skills?.[0] || null;
    setSelectedSkillName(firstSkill?.name || "");
  }, [agent, open]);

  useEffect(() => {
    if (!open) return;
    setSubagentForm({
      child_agent_id: "",
      description: "",
    });
    setSubagentFormError("");
  }, [open, agent?.id]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    async function loadModelKeys() {
      setModelKeysLoading(true);
      setModelKeysError("");
      try {
        const payload = await listApiKeys();
        if (cancelled) return;
        const nextKeys = (payload?.keys || []).filter(
          (item) => item.category === "model" && VISIBLE_PROVIDERS.includes(item.provider),
        );
        setModelKeys(nextKeys);
      } catch (err) {
        if (cancelled) return;
        setModelKeysError(err.message || "加载模型提供商失败");
      } finally {
        if (!cancelled) {
          setModelKeysLoading(false);
        }
      }
    }

    loadModelKeys();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedPersona = useMemo(() => {
    if (!selectedPersonaName) return null;
    return personas.find((persona) => persona.name === selectedPersonaName) || null;
  }, [personas, selectedPersonaName]);

  const promptItems = useMemo(() => {
    if (!agent?.base_resources) return [];
    return agent.base_resources.prompt_resources || [];
  }, [agent]);

  const selectedPrompt = useMemo(() => {
    return promptItems.find((item) => item.key === selectedPromptKey) || promptItems[0] || null;
  }, [promptItems, selectedPromptKey]);

  const runtimeSkills = agent?.base_resources?.runtime_skills || [];
  const selectedSkill = useMemo(() => {
    return runtimeSkills.find((item) => item.name === selectedSkillName) || runtimeSkills[0] || null;
  }, [runtimeSkills, selectedSkillName]);

  const availableModelKeys = useMemo(
    () => modelKeys.filter((item) => item.has_value),
    [modelKeys],
  );

  const candidateAgents = useMemo(
    () => {
      const boundChildIds = new Set(subagents.map((item) => String(item.child_agent_id)));
      return allAgents.filter(
        (item) => String(item.id) !== String(agent?.id) && !boundChildIds.has(String(item.id)),
      );
    },
    [allAgents, agent?.id, subagents],
  );

  const currentModelLabel = useMemo(() => {
    if (!form.model_provider) return "尚未配置模型";
    const providerLabel = PROVIDER_LABELS[form.model_provider] || form.model_provider;
    const modelName = form.model_name?.trim() || "默认模型";
    return `${providerLabel} / ${modelName}`;
  }, [form.model_name, form.model_provider]);

  if (!agent) return null;

  const effectiveWorkingDir = agent.effective_default_working_dir || form.default_working_dir || "";

  const handleOpenPath = async (path) => {
    if (!path) return;
    try {
      await api.openLocalPath(path);
      setOpenPathError("");
    } catch (err) {
      setOpenPathError(err.message || "打开目录失败");
    }
  };

  const resetModelForm = () => {
    onChange("model_provider", agent.model_provider || "");
    onChange("model_name", agent.model_name || "");
    onChange("base_url", agent.base_url || "");
  };

  const handleSubagentFieldChange = (field, value) => {
    setSubagentForm((prev) => ({ ...prev, [field]: value }));
    setSubagentFormError("");
  };

  const handleCreateSubagent = async () => {
    const childAgentId = Number(subagentForm.child_agent_id);
    const selectedChildAgent = candidateAgents.find((item) => Number(item.id) === childAgentId);
    const subagentName = selectedChildAgent?.name?.trim() || "";
    const description = subagentForm.description.trim();

    if (!childAgentId) {
      setSubagentFormError("请先选择一个子Agent。");
      return;
    }
    if (!subagentName) {
      setSubagentFormError("无法读取所选子Agent名称。");
      return;
    }
    if (!description) {
      setSubagentFormError("请输入子Agent描述。");
      return;
    }

    try {
      await onCreateSubagent?.({
        child_agent_id: childAgentId,
        subagent_name: subagentName,
        description,
      });
      setSubagentForm({
        child_agent_id: "",
        description: "",
      });
      setSubagentFormError("");
    } catch {
      // 错误已由父层统一落到 modal error 中。
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="modal-wide">
      <div className="modal-header">
        <div>
          <h3>Agent 配置</h3>
          <p>这里配置的是这个 Agent 自身的长期设置，不包含它在各个工作空间中的会话配置。</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="modal-body">
        <div className="agent-team-config-tabs" role="tablist" aria-label="Agent 配置标签">
          {CONFIG_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`agent-team-config-tabs__tab ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="agent-team-config">
          {activeTab === "basic" ? (
            <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
              <div className="agent-team-config__panel-head">
                <div>
                  <div className="card-title">基本信息</div>
                  <div className="agent-team-config__panel-desc">编辑 Agent 名称与工作目录。</div>
                </div>
              </div>

              <div className="agent-team-config__form-grid">
                <label className="form-label agent-team-config__field">
                  <span>Agent 名称</span>
                  <input
                    className="form-input"
                    value={form.name}
                    onChange={(event) => onChange("name", event.target.value)}
                    placeholder="请输入 Agent 名称"
                  />
                </label>

                <div className="agent-team-config__field">
                  <div className="form-label">创建时间</div>
                  <div className="form-input agent-team-config__readonly">
                    {agent.created_at ? new Date(agent.created_at).toLocaleString("zh-CN") : "未知"}
                  </div>
                </div>

                <label className="form-label agent-team-config__field agent-team-config__field--full">
                  <span>工作目录</span>
                  <div className="agent-team-config__workdir-row">
                    <div className="form-input agent-team-config__readonly agent-team-config__workdir-value">
                      {effectiveWorkingDir || "未设置时由系统决定"}
                    </div>
                    <button
                      className="plain-btn agent-team-config__inline-btn"
                      type="button"
                      onClick={() => handleOpenPath(effectiveWorkingDir)}
                      disabled={!effectiveWorkingDir}
                    >
                      <FolderOpen size={14} />
                      打开目录
                    </button>
                  </div>
                </label>
              </div>

              <div className="agent-team-config__actions agent-team-config__actions--basic">
                <div className="agent-team-config__actions-left">
                  <button className="plain-btn agent-team-config__inline-btn" type="button" onClick={() => setWorkingDirModalOpen(true)}>
                    <FolderOpen size={14} />
                    修改工作目录
                  </button>
                </div>
                <button className="primary-btn compact" type="button" onClick={onSaveBasic} disabled={saving}>
                  {saving ? "保存中..." : "保存基本信息"}
                </button>
              </div>
            </section>
          ) : null}

          {activeTab === "model" ? (
            <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
              <div className="agent-team-config__panel-head">
                <div>
                  <div className="card-title">模型</div>
                  <div className="agent-team-config__panel-desc">这里配置的是这个 Agent base 目录里的持久化模型设置。</div>
                </div>
              </div>

              <div className="agent-team-config__model-layout">
                <div className="agent-team-config__model-summary">
                  <div className="agent-team-config__model-summary-label">当前模型</div>
                  <div className="agent-team-config__model-summary-name">{agent.name}</div>
                  <div className="agent-team-config__model-summary-value">{currentModelLabel}</div>
                  <div className="agent-team-config__model-summary-meta">
                    运行时目录：{form.runtime_agent_name || agent.runtime_agent_name}
                  </div>
                </div>

                <div className="agent-team-config__model-form">
                  <label className="form-label agent-team-config__field">
                    <span>模型提供商</span>
                    <select
                      className="form-input"
                      value={form.model_provider || ""}
                      onChange={(event) => {
                        const provider = event.target.value;
                        onChange("model_provider", provider);
                        const keyInfo = availableModelKeys.find((item) => item.provider === provider);
                        if (keyInfo) {
                          onChange("model_name", keyInfo.model_name || "");
                          onChange("base_url", keyInfo.base_url || "");
                        }
                      }}
                    >
                      <option value="">请选择模型提供商</option>
                      {VISIBLE_PROVIDERS.map((provider) => {
                        const keyInfo = modelKeys.find((item) => item.provider === provider);
                        const hasKey = !!keyInfo?.has_value;
                        return (
                          <option key={provider} value={provider} disabled={!hasKey}>
                            {PROVIDER_LABELS[provider] || provider}
                            {!hasKey ? "（未配置）" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label className="form-label agent-team-config__field">
                    <span>模型名称</span>
                    <input
                      className="form-input"
                      value={form.model_name || ""}
                      onChange={(event) => onChange("model_name", event.target.value)}
                      placeholder="留空时使用该提供商默认模型"
                    />
                  </label>

                  <label className="form-label agent-team-config__field agent-team-config__field--full">
                    <span>Base URL</span>
                    <input
                      className="form-input"
                      value={form.base_url || ""}
                      onChange={(event) => onChange("base_url", event.target.value)}
                      placeholder="留空时使用默认 Base URL"
                    />
                  </label>
                </div>
              </div>

              <div className="agent-team-config__actions">
                <div className="agent-team-config__actions-left">
                  {modelKeysLoading ? <span className="agent-team-config__hint">正在加载可用模型提供商...</span> : null}
                  {modelKeysError ? <span className="agent-team-config__hint agent-team-config__hint--error">{modelKeysError}</span> : null}
                </div>
                <div className="agent-team-config__actions-right">
                  <button className="secondary-btn compact" type="button" onClick={resetModelForm} disabled={saving}>
                    取消
                  </button>
                  <button className="primary-btn compact" type="button" onClick={onSaveModel} disabled={saving}>
                    {saving ? "保存中..." : "保存模型配置"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "prompt" ? (
            <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
              <div className="agent-team-config__panel-head">
                <div>
                  <div className="card-title">提示词</div>
                  <div className="agent-team-config__panel-desc">这里展示当前 Agent 使用的 base 目录与核心提示词文件内容。</div>
                </div>
                <button
                  className="plain-btn agent-team-config__inline-btn"
                  type="button"
                  onClick={() => handleOpenPath(agent.base_resources.base_runtime_dir)}
                  disabled={!agent.base_resources.base_runtime_dir}
                >
                  <FolderOpen size={14} />
                  打开目录
                </button>
              </div>

              <div className="agent-team-config__browser">
                <div className="agent-team-config__browser-list">
                  {promptItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`sidebar-menu-item plain-btn ${selectedPrompt?.key === item.key ? "active" : ""}`}
                      onClick={() => setSelectedPromptKey(item.key)}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>

                <div className="agent-team-config__browser-detail">
                  <div className="agent-team-config__browser-title">{selectedPrompt?.label || "未选择"}</div>
                  <div className="agent-team-config__browser-path">{selectedPrompt?.path || ""}</div>
                  <pre className="agent-team-config__browser-content">{selectedPrompt?.content || "无内容"}</pre>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "skills" ? (
            <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
              <div className="agent-team-config__panel-head">
                <div>
                  <div className="card-title">技能</div>
                  <div className="agent-team-config__panel-desc">这里展示当前 Agent base 目录中的技能，以及这个 Agent 自己追加的私有技能。</div>
                </div>
                <button
                  className="plain-btn agent-team-config__inline-btn"
                  type="button"
                  onClick={() => handleOpenPath(agent.base_resources.base_runtime_dir)}
                  disabled={!agent.base_resources.base_runtime_dir}
                >
                  <FolderOpen size={14} />
                  打开目录
                </button>
              </div>

              <div className="agent-team-config__stat-row">
                <div className="agent-team-config__stat-pill">私有技能：{agent.base_resources.private_skill_count}</div>
                <div className="agent-team-config__stat-pill is-strong">总计：{agent.base_resources.total_skill_count}</div>
              </div>

              <div className="agent-team-config__browser">
                <div className="agent-team-config__browser-list">
                  {runtimeSkills.length === 0 ? (
                    <div className="agent-team-config__empty">当前没有可用技能。</div>
                  ) : runtimeSkills.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={`sidebar-menu-item plain-btn ${selectedSkill?.name === item.name ? "active" : ""}`}
                      onClick={() => setSelectedSkillName(item.name)}
                    >
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>

                <div className="agent-team-config__browser-detail">
                  <div className="agent-team-config__browser-title">{selectedSkill?.name || "未选择"}</div>
                  <div className="agent-team-config__browser-path">{selectedSkill?.path || ""}</div>
                  <pre className="agent-team-config__browser-content">{selectedSkill?.content || "无内容"}</pre>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "persona" ? (
            <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
              <div className="agent-team-config__panel-head">
                <div>
                  <div className="card-title">{selectedPersona?.name || "专家人格"}</div>
                  <div className="agent-team-config__panel-desc">人格说明，提示词和技能</div>
                </div>
              </div>

              <div className="agent-team-config__expert-layout">
                <div className="agent-team-config__expert-list">
                  <button
                    type="button"
                    className={`sidebar-menu-item plain-btn ${!agent.persona_name ? "active" : ""}`}
                    onClick={() => {
                      setSelectedPersonaName("");
                      onChange("persona_name", null);
                    }}
                  >
                    <span className="menu-icon"><Sparkles size={14} /></span>
                    <span>无专家人格</span>
                    {!agent.persona_name ? <span className="agent-team-config__persona-state">当前</span> : null}
                  </button>
                  {personas.map((persona) => (
                    <button
                      key={persona.name}
                      type="button"
                      className={`sidebar-menu-item plain-btn ${agent.persona_name === persona.name ? "active" : ""}`}
                      onClick={() => {
                        setSelectedPersonaName(persona.name);
                        onChange("persona_name", persona.name);
                      }}
                    >
                      <span className="menu-icon"><Sparkles size={14} /></span>
                      <span>{persona.name}</span>
                      {agent.persona_name === persona.name ? <span className="agent-team-config__persona-state">当前</span> : null}
                    </button>
                  ))}
                </div>

                <div className="agent-team-config__expert-preview">
                  <PersonaResourceBrowser persona={selectedPersona} embedded />
                </div>
              </div>

              <div className="agent-team-config__actions">
                <span />
                <button className="primary-btn compact" type="button" onClick={onSavePersona} disabled={saving}>
                  {saving ? "保存中..." : "保存专家配置"}
                </button>
              </div>
            </section>
          ) : null}

          {activeTab === "subagents" ? (
            <section className="dash-card agent-team-config__panel agent-team-config__panel--wide">
              <div className="agent-team-config__panel-head">
                <div>
                  <div className="card-title">子Agent团队</div>
                  <div className="agent-team-config__panel-desc">在这里给当前 Agent 挂接下属 Agent，并设定当前主会话的团队工作模式。</div>
                </div>
              </div>

              <div className="agent-team-config__subagent-topbar">
                <div />
                <div className="agent-team-config__team-mode">
                  <div className="agent-team-config__team-mode-inline">
                    <div className="agent-team-detail__team-mode-head">
                      <span className="agent-team-detail__mode-label">团队工作模式</span>
                      <Tooltip text="这里切换的是当前主会话的团队工作模式；它决定子Agent是否保留记忆，以及是否允许并发执行。" direction="up">
                        <span className="agent-team-detail__mode-help" aria-label="团队工作模式说明">
                          <CircleHelp size={14} strokeWidth={2.2} />
                        </span>
                      </Tooltip>
                    </div>
                    {subagents.length > 0 ? (
                      <div className="agent-team-detail__mode-shell agent-team-config__mode-shell">
                        <div className="agent-team-detail__mode-segmented" role="group" aria-label="团队工作模式">
                          <Tooltip text={COLLABORATOR_MODE_TIP} direction="up">
                            <button
                              type="button"
                              className={`agent-team-detail__mode-option ${currentSubagentMode === "collaborator" ? "is-active" : ""}`}
                              onClick={() => onChangeSubagentMode?.("collaborator")}
                              disabled={subagentModeSaving}
                            >
                              协作者
                            </button>
                          </Tooltip>
                          <Tooltip text={EXECUTOR_MODE_TIP} direction="up">
                            <button
                              type="button"
                              className={`agent-team-detail__mode-option ${currentSubagentMode === "executor" ? "is-active" : ""}`}
                              onClick={() => onChangeSubagentMode?.("executor")}
                              disabled={subagentModeSaving}
                            >
                              执行器
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    ) : (
                      <span className="agent-team-detail__mode-pill is-disabled">未启用</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="agent-team-config__subagent-layout">
                <div className="agent-team-config__subagent-form">
                  <label className="form-label agent-team-config__field">
                    <span>选择子Agent</span>
                    <select
                      className="form-input"
                      value={subagentForm.child_agent_id}
                      onChange={(event) => handleSubagentFieldChange("child_agent_id", event.target.value)}
                    >
                      <option value="">请选择一个 Agent</option>
                      {candidateAgents.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="form-label agent-team-config__field agent-team-config__field--full">
                    <span>描述</span>
                    <textarea
                      className="form-input agent-team-config__textarea"
                      value={subagentForm.description}
                      onChange={(event) => handleSubagentFieldChange("description", event.target.value)}
                      placeholder="告诉主Agent，这个子Agent适合处理什么任务。"
                      rows={4}
                    />
                  </label>
                </div>

                <div className="agent-team-config__subagent-list-wrap">
                  <div className="agent-team-config__stat-row">
                    <div className="agent-team-config__stat-pill">
                      <GitBranch size={14} />
                      当前已挂载 {subagents.length} 个子Agent
                    </div>
                  </div>

                  {subagentsLoading ? (
                    <div className="agent-team-config__empty">正在加载子Agent列表...</div>
                  ) : subagents.length === 0 ? (
                    <div className="agent-team-config__empty">当前还没有配置子Agent。</div>
                  ) : (
                    <div className="agent-team-config__subagent-list">
                      {subagents.map((binding) => (
                        <div key={binding.id} className="agent-team-config__subagent-item">
                          <div className="agent-team-config__subagent-main">
                            <div className="agent-team-config__subagent-top">
                              <div className="agent-team-config__subagent-title">{binding.subagent_name}</div>
                              <div className="agent-team-config__subagent-target">{binding.child_agent_name || `Agent #${binding.child_agent_id}`}</div>
                            </div>
                            <div className="agent-team-config__subagent-desc">{binding.description}</div>
                          </div>
                          <button
                            type="button"
                            className="plain-btn agent-team-config__subagent-delete"
                            onClick={() => onDeleteSubagent?.(binding.id)}
                            disabled={subagentsSaving}
                          >
                            <Trash2 size={14} />
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {subagentFormError ? <div className="modal-inline-error">{subagentFormError}</div> : null}

              <div className="agent-team-config__actions">
                <span />
                <button className="primary-btn compact" type="button" onClick={handleCreateSubagent} disabled={subagentsSaving}>
                  {subagentsSaving ? "处理中..." : "新增子Agent"}
                </button>
              </div>
            </section>
          ) : null}

          {error ? <div className="modal-inline-error">{error}</div> : null}
          {openPathError ? <div className="modal-inline-error">{openPathError}</div> : null}
        </div>
      </div>

      <div className="modal-footer">
        <button className="secondary-btn" type="button" onClick={onClose}>
          关闭
        </button>
      </div>

      <AgentWorkingDirModal
        open={workingDirModalOpen}
        onClose={() => {
          setWorkingDirModalOpen(false);
        }}
        workingDirKind="agent"
        agentRefId={agent.id}
      />
    </Modal>
  );
}






