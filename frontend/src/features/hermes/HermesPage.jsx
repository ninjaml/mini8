import "./hermes.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useState, useRef, useMemo } from "react";

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};
import { Settings, RefreshCw, Eye, EyeOff, ChevronDown, ChevronRight, Plus, Play, Pause, Trash2, Edit2, RotateCcw } from "lucide-react";
import { hermesApi } from "./hermesApi";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";

/**
 * 将 cron 表达式翻译为中文描述。
 * 格式：分 时 日 月 周
 * 仅处理常见模式，复杂表达式 fallback 回原始字符串。
 */
function formatCron(expr) {
  if (!expr || typeof expr !== "string") return "";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, day, month, dow] = parts;

  // 每 X 分钟
  if (min.startsWith("*/") && hour === "*" && day === "*" && month === "*" && dow === "*") {
    return `每 ${min.slice(2)} 分钟`;
  }
  // 每 X 小时（整点）
  if (min === "0" && hour.startsWith("*/") && day === "*" && month === "*" && dow === "*") {
    return `每 ${hour.slice(2)} 小时`;
  }
  // 每天 HH:mm
  if (min !== "*" && hour !== "*" && day === "*" && month === "*" && dow === "*") {
    return `每天 ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  // 每周 X HH:mm
  if (min !== "*" && hour !== "*" && day === "*" && month === "*" && dow !== "*" && !dow.includes(",")) {
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const d = parseInt(dow, 10);
    const wd = weekdays[d] || `周${d}`;
    return `每周${wd} ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  // 每月 D 日 HH:mm
  if (min !== "*" && hour !== "*" && day !== "*" && month === "*" && dow === "*") {
    return `每月${day}日 ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  // 每年 M 月 D 日 HH:mm
  if (min !== "*" && hour !== "*" && day !== "*" && month !== "*" && dow === "*") {
    return `每年${month}月${day}日 ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }

  return expr;
}

/**
 * 将 ISO 8601 时间字符串格式化为友好格式（去掉时区）。
 * 2026-05-19T09:00:00+08:00 → 2026-05-19 09:00
 */
function formatNextRun(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${MM}-${dd} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

export default function HermesPage({ subNav, agent, jobs, skills, toolsets, loadData }) {
  const [error, setError] = useState("");

  // 配置弹框
  const [configOpen, setConfigOpen] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [editingConfig, setEditingConfig] = useState({ api_base_url: "", api_key: "", dashboard_url: "" });
  const [savingConfig, setSavingConfig] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [configTab, setConfigTab] = useState("connection");

  // 对话
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const chatEndRef = useRef(null);

  // 会话
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionMessagesLoading, setSessionMessagesLoading] = useState(false);

  // 技能详情
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [hasInitExpanded, setHasInitExpanded] = useState(false);

  // Job prompt 展开
  const [expandedPrompts, setExpandedPrompts] = useState(new Set());

  // Job 弹框
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [jobForm, setJobForm] = useState({ name: "", prompt: "", schedule: "", deliver: "local", skills: "" });
  const [jobFormError, setJobFormError] = useState("");
  const [jobFormLoading, setJobFormLoading] = useState(false);

  // 删除确认
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingJob, setDeletingJob] = useState(null);
  const [deleteSessionConfirmOpen, setDeleteSessionConfirmOpen] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // id/name of item being acted on (job id or skill name)

  const isLoading = !agent && !skills.length && !jobs.length && !toolsets?.length;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (subNav === "agent") {
      loadSessions();
    }
  }, [subNav]);

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const data = await hermesApi.getSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(`获取会话列表失败: ${err.message}`);
    } finally {
      setSessionsLoading(false);
    }
  }

  async function selectSession(sessionId) {
    if (activeSessionId === sessionId) return;
    setActiveSessionId(sessionId);
    setSessionMessagesLoading(true);
    try {
      const data = await hermesApi.getSessionMessages(sessionId);
      const msgs = (data.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
      setMessages(msgs);
    } catch (err) {
      setError(`加载会话消息失败: ${err.message}`);
    } finally {
      setSessionMessagesLoading(false);
    }
  }

  function startNewConversation() {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  }

  function handleDeleteSession(sessionId, e) {
    e.stopPropagation();
    setDeletingSessionId(sessionId);
    setDeleteSessionConfirmOpen(true);
  }

  async function confirmDeleteSession() {
    if (!deletingSessionId) return;
    setActionLoading(deletingSessionId);
    try {
      await hermesApi.deleteSession(deletingSessionId);
      if (activeSessionId === deletingSessionId) {
        startNewConversation();
      }
      loadSessions();
      setDeleteSessionConfirmOpen(false);
      setDeletingSessionId(null);
    } catch (err) {
      setError(`删除会话失败: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  // 技能按分类分组
  const skillsByCategory = useMemo(() => {
    const groups = {};
    for (const skill of skills) {
      const cat = skill.category || "uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(skill);
    }
    return groups;
  }, [skills]);

  // 默认展开第一个分类
  useEffect(() => {
    if (skills.length > 0 && !hasInitExpanded) {
      const cats = Object.keys(skillsByCategory);
      if (cats.length > 0) {
        setExpandedCategories(new Set([cats[0]]));
        setHasInitExpanded(true);
      }
    }
  }, [skills, skillsByCategory, hasInitExpanded]);

  function toggleCategory(cat) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  async function openConfigModal() {
    setConfigOpen(true);
    setConfigTab("connection");
    setConfigLoading(true);
    try {
      const configs = await hermesApi.getConfigs();
      const find = (key, def = "") => configs.find((c) => c.key === key)?.value || def;
      setEditingConfig({
        api_base_url: find("api_base_url", "http://127.0.0.1:8642"),
        api_key: find("api_key", ""),
        dashboard_url: find("dashboard_url", "http://127.0.0.1:9119"),
      });
    } catch (err) {
      setError(`加载配置失败: ${err.message}`);
    } finally {
      setConfigLoading(false);
    }
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      await Promise.all([
        hermesApi.updateConfig("api_base_url", editingConfig.api_base_url),
        hermesApi.updateConfig("api_key", editingConfig.api_key),
        hermesApi.updateConfig("dashboard_url", editingConfig.dashboard_url),
      ]);
      setConfigOpen(false);
      loadData && (await loadData());
    } catch (err) {
      setError(`保存配置失败: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  }

  // --- Job control ---

  function openCreateJobModal() {
    setEditingJob(null);
    setJobForm({ name: "", prompt: "", schedule: "0 9 * * *", deliver: "local", skills: "" });
    setJobFormError("");
    setJobModalOpen(true);
  }

  function openEditJobModal(job) {
    setEditingJob(job);
    setJobForm({
      name: job.name || "",
      prompt: job.prompt || "",
      schedule: job.schedule_display || "",
      deliver: job.deliver || "local",
      skills: Array.isArray(job.skills) ? job.skills.join(", ") : "",
    });
    setJobFormError("");
    setJobModalOpen(true);
  }

  async function handleSaveJob() {
    const name = jobForm.name.trim();
    const prompt = jobForm.prompt.trim();
    const schedule = jobForm.schedule.trim();
    if (!name || !prompt || !schedule) {
      setJobFormError("名称、Prompt 和调度表达式不能为空");
      return;
    }
    const scheduleParts = schedule.split(/\s+/);
    if (scheduleParts.length !== 5) {
      setJobFormError("调度表达式格式错误，应为 5 个字段（分 时 日 月 周）");
      return;
    }
    setJobFormLoading(true);
    try {
      const payload = {
        name,
        prompt,
        schedule,
        deliver: jobForm.deliver || "local",
        skills: jobForm.skills
          ? jobForm.skills.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      };
      if (editingJob) {
        await hermesApi.updateJob(editingJob.id, payload);
      } else {
        await hermesApi.createJob(payload);
      }
      setJobModalOpen(false);
      loadData && (await loadData());
    } catch (err) {
      setJobFormError(err.message || "保存失败");
    } finally {
      setJobFormLoading(false);
    }
  }

  async function handleTriggerJob(job) {
    setActionLoading(job.id);
    try {
      await hermesApi.triggerJob(job.id);
      loadData && (await loadData());
    } catch (err) {
      setError(`执行失败: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePauseJob(job) {
    setActionLoading(job.id);
    try {
      await hermesApi.pauseJob(job.id);
      loadData && (await loadData());
    } catch (err) {
      setError(`暂停失败: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResumeJob(job) {
    setActionLoading(job.id);
    try {
      await hermesApi.resumeJob(job.id);
      loadData && (await loadData());
    } catch (err) {
      setError(`恢复失败: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmDeleteJob() {
    if (!deletingJob) return;
    setActionLoading(deletingJob.id);
    try {
      await hermesApi.deleteJob(deletingJob.id);
      setDeleteConfirmOpen(false);
      setDeletingJob(null);
      loadData && (await loadData());
    } catch (err) {
      setError(`删除失败: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleSkill(skill) {
    const nextEnabled = !skill.enabled;
    // 乐观更新：先改 UI 再发请求
    setSelectedSkill((prev) => (prev?.name === skill.name ? { ...prev, enabled: nextEnabled } : prev));
    setActionLoading(skill.name);
    try {
      await hermesApi.toggleSkill(skill.name, nextEnabled);
      loadData && (await loadData());
    } catch (err) {
      // 失败回滚
      setSelectedSkill((prev) => (prev?.name === skill.name ? { ...prev, enabled: skill.enabled } : prev));
      setError(`切换技能状态失败: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSend() {
    if (!input.trim() || chatting) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatting(true);

    try {
      const payload = {
        model: agent?.model || "hermes-agent",
        messages: [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userMsg },
        ],
        stream: false,
      };
      const response = await hermesApi.chat(payload, activeSessionId);
      const content = response?.choices?.[0]?.message?.content || JSON.stringify(response);
      const now = Date.now() / 1000;
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "user", content: userMsg, timestamp: now },
        { role: "assistant", content, timestamp: now },
      ]);

      const returnedSessionId = response?._session_id;
      if (!activeSessionId && returnedSessionId) {
        setActiveSessionId(returnedSessionId);
      }

      setTimeout(() => loadSessions(), 500);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ 错误: ${err.message}` }]);
    } finally {
      setChatting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="hermes-page">
        <div className="hermes-loading">正在连接 Hermes...</div>
      </div>
    );
  }

  return (
    <div className="hermes-page">
      {error && <div className="hermes-error">{error}</div>}

      {/* Topbar */}
      <div className="hermes-topbar">
        <div className="hermes-topbar-left">
          <span className={`hermes-status ${agent?.status === "online" ? "online" : "offline"}`}>
            {agent?.status === "online" ? "● 在线" : "● 离线"}
          </span>
          {agent?.model && (
            <span className="hermes-model-info">
              {agent.model}
              {agent.personality && (
                <span className="hermes-personality-tag">{agent.personality}</span>
              )}
            </span>
          )}
        </div>
        <div className="hermes-topbar-actions">
          <button className="hermes-refresh-btn" onClick={loadData} disabled={isLoading} title="刷新">
            <RefreshCw size={16} className={isLoading ? "spin" : ""} />
            <span>刷新</span>
          </button>
          <button className="hermes-config-btn" onClick={openConfigModal} title="配置">
            <Settings size={16} />
            <span>配置</span>
          </button>
        </div>
      </div>

      {subNav === "agent" ? (
        <div className="hermes-agent-layout">
          {/* 左侧会话列表 */}
          <div className="hermes-session-sidebar">
            <button className="hermes-new-chat-btn" onClick={startNewConversation}>
              + 新对话
            </button>
            <div className="hermes-session-list">
              {sessionsLoading && <div className="hermes-session-loading">加载中...</div>}
              {!sessionsLoading && sessions.length === 0 && (
                <div className="hermes-session-empty">暂无会话</div>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`hermes-session-item ${activeSessionId === s.id ? "active" : ""} ${s.is_active ? "live" : ""}`}
                  onClick={() => selectSession(s.id)}
                  title={s.preview || "无预览"}
                >
                  <div className="hermes-session-title">
                    {s.title || s.preview || "未命名会话"}
                  </div>
                  <div className="hermes-session-meta">
                    <span>{s.message_count || 0} 条消息</span>
                    <span>{formatTime(s.last_active)}</span>
                  </div>
                  <button
                    className="hermes-session-delete"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧聊天区 */}
          <div className="hermes-chat-area">
            <div className="hermes-messages">
              {sessionMessagesLoading && (
                <div className="hermes-chat-loading">加载历史消息...</div>
              )}
              {!sessionMessagesLoading && messages.length === 0 && (
                <div className="hermes-chat-hint">
                  {activeSessionId
                    ? "加载完成，开始对话吧"
                    : "⚠️ 这是外部 Hermes Agent，非 camphorOS Agent"}
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={msg.id || `${msg.role}-${msg.timestamp || i}`}
                  className={`hermes-msg ${msg.role === "assistant" ? "hermes-msg--assistant" : "hermes-msg--user"}`}
                >
                  <div className="hermes-msg-label">{msg.role === "user" ? "你" : "Hermes"}</div>
                  {msg.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                  ) : (
                    <pre>{msg.content}</pre>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="hermes-input-row">
              <input
                className="hermes-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={activeSessionId ? "继续对话..." : "输入消息开始新对话..."}
                disabled={chatting || agent?.status !== "online"}
              />
              <button
                className="hermes-send-btn"
                onClick={handleSend}
                disabled={chatting || agent?.status !== "online"}
              >
                {chatting ? "..." : "发送"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 技能/工具/任务 = 全屏内容区 */
        <div className="hermes-full-content">
          {subNav === "skill" && (
            <div className="hermes-skill-layout">
              <div className="hermes-skill-list">
                {Object.entries(skillsByCategory).map(([cat, catSkills]) => (
                  <div key={cat}>
                    <div className="hermes-skill-category" onClick={() => toggleCategory(cat)}>
                      {expandedCategories.has(cat) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>{cat} ({catSkills.length})</span>
                    </div>
                    {expandedCategories.has(cat) && (
                      <div className="hermes-skill-items">
                        {catSkills.map((skill) => (
                          <div
                            key={skill.name}
                            className={`hermes-skill-item ${selectedSkill?.name === skill.name ? "active" : ""} ${skill.enabled ? "" : "disabled"}`}
                            onClick={() => setSelectedSkill(skill)}
                            title={skill.enabled ? "已启用" : "已禁用"}
                          >
                            <span className={`hermes-skill-item-dot ${skill.enabled ? "enabled" : "disabled"}`} />
                            {skill.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="hermes-skill-detail">
                {selectedSkill ? (
                  <div className="hermes-skill-detail-inner">
                    <h4>{selectedSkill.name}</h4>
                    <p className="hermes-skill-desc">{selectedSkill.description || "无描述"}</p>
                    <div className="hermes-skill-meta">
                      <div><span>分类</span> {selectedSkill.category || "-"}</div>
                      <div className="hermes-skill-status-row">
                        <span>状态</span>
                        <span className={`hermes-skill-status-dot ${selectedSkill.enabled ? "enabled" : "disabled"}`}>
                          ● {selectedSkill.enabled ? "已启用" : "已禁用"}
                        </span>
                        <div
                          className={`hermes-skill-toggle ${selectedSkill.enabled ? "enabled" : "disabled"} ${actionLoading === selectedSkill.name ? "is-busy" : ""}`}
                          onClick={() => handleToggleSkill(selectedSkill)}
                          role="switch"
                          aria-checked={selectedSkill.enabled}
                          tabIndex={0}
                          title={selectedSkill.enabled ? "点击禁用" : "点击启用"}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="hermes-side-empty">选择一个技能查看详情</div>
                )}
              </div>
            </div>
          )}

          {subNav === "tool" && (
            <div className="hermes-tool-list">
              {Array.isArray(toolsets) && toolsets.length > 0 ? (
                <div className="hermes-toolset-grid">
                  {toolsets.map((ts) => (
                    <div key={ts.name} className="hermes-toolset-card">
                      <div className="hermes-toolset-card-header">
                        <span className="hermes-toolset-label">{ts.label || ts.name}</span>
                        <div className="hermes-toolset-badges">
                          <span className={`hermes-badge ${ts.enabled ? "enabled" : "disabled"}`} title="管理员是否允许 Agent 使用">
                            {ts.enabled ? "已启用" : "已禁用"}
                          </span>
                          <span className={`hermes-badge ${ts.configured ? "configured" : "unconfigured"}`} title="必要配置项是否已填写">
                            {ts.configured ? "已配置" : "未配置"}
                          </span>
                          <span className={`hermes-badge ${ts.available ? "available" : "unavailable"}`} title="底层依赖当前是否在线">
                            {ts.available ? "可用" : "不可用"}
                          </span>
                        </div>
                      </div>
                      {ts.description && <p className="hermes-toolset-desc">{ts.description}</p>}
                      {ts.tools?.length > 0 && (
                        <div className="hermes-toolset-tools">
                          {ts.tools.map((t) => (
                            <span key={t} className="hermes-tool-tag">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="hermes-side-empty">暂无工具集</div>
              )}
            </div>
          )}

          {subNav === "job" && (
            <div className="hermes-job-list">
              <div className="hermes-job-toolbar">
                <button className="hermes-job-create-btn" onClick={openCreateJobModal} type="button">
                  <Plus size={14} />
                  <span>新建任务</span>
                </button>
              </div>
              {jobs.length > 0 ? (
                jobs.map((job) => {
                  const promptOpen = expandedPrompts.has(job.id);
                  const isActing = actionLoading === job.id;
                  return (
                    <div key={job.id} className="hermes-job-item">
                      <div className="hermes-job-header">
                        <div className="hermes-job-name">{job.name}</div>
                        <div className="hermes-job-actions">
                          <button
                            className="hermes-job-action-btn"
                            onClick={() => handleTriggerJob(job)}
                            disabled={isActing}
                            title="立即执行"
                            type="button"
                          >
                            <Play size={12} />
                          </button>
                          {job.state === "paused" || job.paused_at ? (
                            <button
                              className="hermes-job-action-btn"
                              onClick={() => handleResumeJob(job)}
                              disabled={isActing}
                              title="恢复"
                              type="button"
                            >
                              <RotateCcw size={12} />
                            </button>
                          ) : (
                            <button
                              className="hermes-job-action-btn"
                              onClick={() => handlePauseJob(job)}
                              disabled={isActing}
                              title="暂停"
                              type="button"
                            >
                              <Pause size={12} />
                            </button>
                          )}
                          <button
                            className="hermes-job-action-btn"
                            onClick={() => openEditJobModal(job)}
                            disabled={isActing}
                            title="编辑"
                            type="button"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            className="hermes-job-action-btn danger"
                            onClick={() => { setDeletingJob(job); setDeleteConfirmOpen(true); }}
                            disabled={isActing}
                            title="删除"
                            type="button"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="hermes-job-meta">
                        <span>{formatCron(job.schedule_display)}</span>
                        <span className={`hermes-badge ${job.state === "scheduled" ? "enabled" : job.state === "paused" ? "paused" : "disabled"}`}>
                          {job.state === "scheduled" ? "等待执行" : job.state === "paused" ? "已暂停" : job.state}
                        </span>
                        {job.deliver && (
                          <span className="hermes-badge deliver">
                            投递: {({ weixin: "微信", local: "本地" }[job.deliver]) || job.deliver}
                          </span>
                        )}
                        {job.next_run_at && <span>下次: {formatNextRun(job.next_run_at)}</span>}
                      </div>
                      {job.last_run_at && (
                        <div className="hermes-job-lastrun">
                          上次运行: {formatNextRun(job.last_run_at)}
                          {job.last_status === "ok" && <span className="hermes-badge enabled">成功</span>}
                          {job.last_status == null && <span className="hermes-badge disabled">未运行</span>}
                          {job.last_error != null && <span className="hermes-badge unavailable">失败: {job.last_error}</span>}
                        </div>
                      )}
                      {job.paused_at && (
                        <div className="hermes-job-paused">
                          暂停于: {formatNextRun(job.paused_at)}
                          {job.paused_reason && <span>（{job.paused_reason}）</span>}
                        </div>
                      )}
                      {job.prompt && (
                        <div className="hermes-job-prompt-row">
                          <button
                            className="hermes-job-prompt-toggle"
                            onClick={() => {
                              setExpandedPrompts((prev) => {
                                const next = new Set(prev);
                                if (next.has(job.id)) next.delete(job.id);
                                else next.add(job.id);
                                return next;
                              });
                            }}
                            type="button"
                          >
                            {promptOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span>Prompt</span>
                          </button>
                          {promptOpen && (
                            <pre className="hermes-job-prompt">{job.prompt}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="hermes-side-empty">暂无任务</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 配置弹框 */}
      {configOpen && (
        <div className="modal-overlay" onClick={() => setConfigOpen(false)}>
          <div className={`modal-box ${configTab === "guide" ? "modal-box-wide" : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>⚙️ Hermes 接入配置</h3>
                <p>配置包保存即可生效</p>
              </div>
              <button className="close-btn" type="button" onClick={() => setConfigOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {configLoading ? (
                <div className="hermes-loading">加载配置...</div>
              ) : (
                <>
                  <div className="hermes-tabs">
                    <button className={`hermes-tab ${configTab === "connection" ? "active" : ""}`} onClick={() => setConfigTab("connection")} type="button">api_server 连接配置</button>
                    <button className={`hermes-tab ${configTab === "dashboard" ? "active" : ""}`} onClick={() => setConfigTab("dashboard")} type="button">Dashboard 连接配置</button>
                    <button className={`hermes-tab ${configTab === "guide" ? "active" : ""}`} onClick={() => setConfigTab("guide")} type="button">配置指南</button>
                  </div>
                  <div className="hermes-tab-content">
                    {configTab === "connection" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div>
                          <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>hermes api_server 访问地址</label>
                          <input className="hermes-input" value={editingConfig.api_base_url} onChange={(e) => setEditingConfig((prev) => ({ ...prev, api_base_url: e.target.value }))} placeholder="http://127.0.0.1:8642" />
                        </div>
                        <div>
                          <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>hermes api_server_key</label>
                          <div className="hermes-input-wrap">
                            <input className="hermes-input" type={showApiKey ? "text" : "password"} value={editingConfig.api_key} onChange={(e) => setEditingConfig((prev) => ({ ...prev, api_key: e.target.value }))} placeholder="留空表示无认证" />
                            <button type="button" className="hermes-input-eye" onClick={() => setShowApiKey((v) => !v)} title={showApiKey ? "隐藏" : "显示"}>
                              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {configTab === "dashboard" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div>
                          <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Dashboard URL</label>
                          <input className="hermes-input" value={editingConfig.dashboard_url} onChange={(e) => setEditingConfig((prev) => ({ ...prev, dashboard_url: e.target.value }))} placeholder="http://127.0.0.1:9119" />
                        </div>
                      </div>
                    )}
                    {configTab === "guide" && (
                      <div className="hermes-guide">
                        <h4>📘 Hermes 配置指南</h4>

                        <h5>一、Dashboard 配置</h5>
                        <p><strong>Hermes Dashboard 全 IP 开放 + 依赖修复</strong></p>

                        <p><strong>1. 修复 Dashboard 依赖报错</strong></p>
                        <p>报错：Web UI dependencies not installed / No module named 'uvicorn'</p>
                        <pre>{`cd C:\\Users\\Administrator\\AppData\\Local\\hermes\\hermes-agent
.\\venv\\Scripts\\python.exe -m pip install fastapi uvicorn python-multipart
.\\venv\\Scripts\\python.exe -m pip install -e .`}</pre>

                        <p><strong>2. 全 IP 开放（局域网 / 远程可访问）</strong></p>
                        <p>① 杀死旧进程：</p>
                        <pre>taskkill /F /PID 7932</pre>
                        <p>② 正确启动命令（必须带这 3 个参数）：</p>
                        <pre>hermes dashboard --host 0.0.0.0 --insecure --no-open</pre>
                        <p>③ 防火墙放行端口：</p>
                        <pre>netsh advfirewall firewall add rule name="Hermes Dashboard 9119" dir=in action=allow protocol=TCP localport=9119 remoteip=any enable=yes</pre>

                        <p><strong>3. 验证是否成功</strong></p>
                        <pre>netstat -ano | findstr :9119</pre>
                        <p>看到 <code>TCP 0.0.0.0:9119 0.0.0.0:0 LISTENING</code> 即成功全 IP 开放。</p>

                        <h5>二、API Server 配置</h5>
                        <p><strong>Hermes API Server 配置步骤</strong></p>

                        <p><strong>步骤 1：配置核心参数</strong></p>
                        <pre>{`# 1. 启用 API Server
hermes config set API_SERVER_ENABLED true

# 2. 设置符合要求的长密钥（≥32 位）
hermes config set API_SERVER_KEY "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890"

# 3. 配置监听所有 IP（允许远程访问）
hermes config set API_SERVER_HOST 0.0.0.0

# 4. 固定默认端口（8642）
hermes config set API_SERVER_PORT 8642`}</pre>

                        <p><strong>步骤 2：重启 API 服务</strong></p>
                        <pre>{`# 1. 查看 8642 端口占用 PID
netstat -ano | findstr :8642

# 2. 终止旧进程（替换 XXX 为查到的 PID）
taskkill /F /PID XXX

# 3. 启动网关，加载配置
hermes gateway start`}</pre>

                        <p><strong>步骤 3：防火墙放行（必做）</strong></p>
                        <pre>netsh advfirewall firewall add rule name="Hermes API 8642" dir=in action=allow protocol=TCP localport=8642 remoteip=any enable=yes</pre>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary-btn" type="button" onClick={() => setConfigOpen(false)}>关闭</button>
              {configTab !== "guide" && (
                <button className="primary-btn" type="button" onClick={handleSaveConfig} disabled={savingConfig || configLoading}>
                  {savingConfig ? "保存中..." : "保存"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Job 编辑/创建弹框 */}
      {jobModalOpen && (
        <div className="modal-overlay" onClick={() => setJobModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div>
                <h3>{editingJob ? "✏️ 编辑任务" : "➕ 新建任务"}</h3>
                <p>{editingJob ? `修改「${editingJob.name}」的配置` : "创建一个新的 Hermes 定时任务"}</p>
              </div>
              <button className="close-btn" type="button" onClick={() => setJobModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {jobFormError && <div className="hermes-error" style={{ marginBottom: 12 }}>{jobFormError}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>任务名称</label>
                  <input className="hermes-input" value={jobForm.name} onChange={(e) => setJobForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="例如：每日早报" />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Cron 调度表达式</label>
                  <input className="hermes-input" value={jobForm.schedule} onChange={(e) => setJobForm((prev) => ({ ...prev, schedule: e.target.value }))} placeholder="0 9 * * *" />
                  <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>格式：分 时 日 月 周</div>
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>投递方式</label>
                  <select
                    className="hermes-input"
                    value={jobForm.deliver}
                    onChange={(e) => setJobForm((prev) => ({ ...prev, deliver: e.target.value }))}
                    style={{ cursor: "pointer" }}
                  >
                    <option value="local">本地</option>
                    <option value="weixin">微信</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>技能（逗号分隔，可选）</label>
                  <input className="hermes-input" value={jobForm.skills} onChange={(e) => setJobForm((prev) => ({ ...prev, skills: e.target.value }))} placeholder="arxiv, search" />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Prompt</label>
                  <textarea
                    className="hermes-input"
                    value={jobForm.prompt}
                    onChange={(e) => setJobForm((prev) => ({ ...prev, prompt: e.target.value }))}
                    placeholder="输入任务执行时发送给 Agent 的提示词..."
                    rows={6}
                    style={{ resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary-btn" type="button" onClick={() => setJobModalOpen(false)}>取消</button>
              <button className="primary-btn" type="button" onClick={handleSaveJob} disabled={jobFormLoading}>
                {jobFormLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除会话确认弹框 */}
      <ConfirmDialog
        isOpen={deleteSessionConfirmOpen}
        title="🗑️ 删除会话"
        message="确认删除此会话吗？此操作不可撤销。"
        onConfirm={confirmDeleteSession}
        onCancel={() => {
          setDeleteSessionConfirmOpen(false);
          setDeletingSessionId(null);
        }}
      />

      {/* 删除任务确认弹框 */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="🗑️ 删除任务"
        message={deletingJob ? `确认删除任务「${deletingJob.name}」吗？此操作不可撤销。` : ""}
        onConfirm={confirmDeleteJob}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeletingJob(null);
        }}
      />
    </div>
  );
}
