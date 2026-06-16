import { useState, useMemo } from "react";

export function OverviewTab({ data, cron }) {
  const { agents, defaultId, tools, skills, loading, error, loadAll } = data;
  const { jobs: cronJobs } = cron || {};
  const [selectedAgentId, setSelectedAgentId] = useState(null);

  const selectedAgent = useMemo(() => {
    if (!agents.length) return null;
    return agents.find((a) => a.id === selectedAgentId) || agents[0];
  }, [agents, selectedAgentId]);

  // 过滤出当前 agent 的定时任务（如果 job 有 agent 字段）
  const agentJobs = useMemo(() => {
    if (!cronJobs?.length) return [];
    if (!selectedAgent) return cronJobs;
    return cronJobs.filter(
      (j) => !j.agentId || j.agentId === selectedAgent.id
    );
  }, [cronJobs, selectedAgent]);

  return (
    <div className="openclaw-tab-content openclaw-overview">
      {/* 顶部栏：Agent 选择器 + 操作 */}
      <div className="openclaw-topbar">
        <div className="openclaw-topbar-left">
          {agents.length > 1 ? (
            <select
              className="openclaw-agent-select"
              value={selectedAgent?.id || ""}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.id}
                  {defaultId === agent.id ? " (default)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="openclaw-agent-select-static">
              {selectedAgent?.id || "未选择"}
              {defaultId === selectedAgent?.id ? " (default)" : ""}
            </span>
          )}
        </div>
        <div className="openclaw-topbar-actions">
          <button
            type="button"
            className="openclaw-action-btn-sm"
            onClick={loadAll}
            disabled={loading}
            title="刷新"
          >
            <span className={loading ? "spin" : ""}>↻</span>
            <span>刷新</span>
          </button>
        </div>
      </div>

      {error && <div className="openclaw-error-bar">{error}</div>}

      {/* 主体：左右卡片 */}
      <div className="openclaw-overview-grid">
        {/* 代理上下文 */}
        <div className="openclaw-overview-card">
          <h4>代理上下文</h4>
          <p className="openclaw-overview-desc">工作区、身份和模型配置。</p>
          {selectedAgent ? (
            <div className="openclaw-context-grid">
              <div className="openclaw-context-item">
                <label>工作区</label>
                <span>{selectedAgent.workspace || "—"}</span>
              </div>
              <div className="openclaw-context-item">
                <label>主模型</label>
                <span>{selectedAgent.model?.primary || selectedAgent.model || "—"}</span>
              </div>
              <div className="openclaw-context-item">
                <label>运行时</label>
                <span>{selectedAgent.agentRuntime?.id || "auto"}</span>
              </div>
              <div className="openclaw-context-item">
                <label>运行时来源</label>
                <span>{selectedAgent.agentRuntime?.source || "—"}</span>
              </div>
              <div className="openclaw-context-item">
                <label>默认</label>
                <span>{defaultId === selectedAgent.id ? "是" : "否"}</span>
              </div>
            </div>
          ) : (
            <p className="openclaw-empty">暂无 Agent</p>
          )}
        </div>

        {/* 频道 */}
        <div className="openclaw-overview-card">
          <h4>频道</h4>
          <p className="openclaw-overview-desc">Gateway 全局频道状态快照。</p>
          <p className="openclaw-empty">未找到频道。</p>
        </div>
      </div>

      {/* Tools + Skills */}
      <div className="openclaw-overview-grid">
        <div className="openclaw-overview-card">
          <h4>
            Tools
            <span className="openclaw-count">{tools.length}</span>
          </h4>
          <div className="openclaw-resource-list">
            {tools.length === 0 ? (
              <p className="openclaw-empty">暂无 Tool</p>
            ) : (
              <ul className="openclaw-mini-list">
                {tools.slice(0, 12).map((tool) => (
                  <li key={tool.id}>
                    <span className="openclaw-mini-name">{tool.label || tool.id}</span>
                    <span className="openclaw-mini-meta">{tool.groupLabel}</span>
                  </li>
                ))}
                {tools.length > 12 && (
                  <li className="openclaw-more">+{tools.length - 12} 更多</li>
                )}
              </ul>
            )}
          </div>
        </div>
        <div className="openclaw-overview-card">
          <h4>
            Skills
            <span className="openclaw-count">{skills.length}</span>
          </h4>
          <div className="openclaw-resource-list">
            {skills.length === 0 ? (
              <p className="openclaw-empty">暂无 Skill</p>
            ) : (
              <ul className="openclaw-mini-list">
                {skills.map((skill) => (
                  <li key={skill.name}>
                    <span className="openclaw-mini-name">{skill.name}</span>
                    <span className={`openclaw-badge ${skill.disabled ? "disabled" : "enabled"}`}>
                      {skill.disabled ? "已禁用" : "已启用"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 调度器 */}
      {agentJobs.length > 0 && (
        <div className="openclaw-overview-card openclaw-scheduler-card">
          <h4>调度器</h4>
          <p className="openclaw-overview-desc">Gateway 定时任务状态。</p>
          <div className="openclaw-scheduler-stats">
            <div className="openclaw-scheduler-stat">
              <label>已启用</label>
              <span>是</span>
            </div>
            <div className="openclaw-scheduler-stat">
              <label>任务</label>
              <span>{agentJobs.length}</span>
            </div>
            <div className="openclaw-scheduler-stat">
              <label>下次唤醒</label>
              <span>
                {(() => {
                  const nextRuns = agentJobs
                    .filter((j) => j.enabled !== false && j.state?.nextRunAtMs)
                    .map((j) => j.state.nextRunAtMs);
                  if (!nextRuns.length) return "—";
                  const earliest = Math.min(...nextRuns);
                  return new Date(earliest).toLocaleString("zh-CN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                })()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 代理定时任务 */}
      {agentJobs.length > 0 && (
        <div className="openclaw-overview-card">
          <h4>代理定时任务</h4>
          <p className="openclaw-overview-desc">面向此代理的计划任务。</p>
          <div className="openclaw-cron-list">
            {agentJobs.map((job) => (
              <div key={job.id} className="openclaw-cron-item">
                <div className="openclaw-cron-item-header">
                  <span className="openclaw-cron-item-name">{job.name}</span>
                  <span
                    className={`openclaw-badge ${job.enabled !== false ? "enabled" : "disabled"}`}
                  >
                    {job.enabled !== false ? "已启用" : "已禁用"}
                  </span>
                </div>
                <div className="openclaw-cron-item-meta">
                  <code>
                    {typeof job.schedule === "string"
                      ? job.schedule
                      : job.schedule?.expr || JSON.stringify(job.schedule)}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
