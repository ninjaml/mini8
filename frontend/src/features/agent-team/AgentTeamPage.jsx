import { Bot, GitBranch, Link2, Trash2, Waypoints, Zap } from "lucide-react";

function formatWorkspaceSummary(agent) {
  const names = agent.workspace_names || [];
  if (names.length === 0) return "未加入工作空间";
  if (names.length <= 3) return names.join("、");
  return `${names.slice(0, 3).join("、")} +${names.length - 3}`;
}

function formatPathSummary(path) {
  if (!path) return "未设置";
  return path.length > 48 ? `...${path.slice(-48)}` : path;
}

function handleEnterSpaceActivate(event, onActivate) {
  // 卡片外层从 button 改成 div + role=button 后，键盘可达性需要手动补回来。
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onActivate?.();
  }
}

function ExternalAgentCard({
  name,
  subtitle,
  configured,
  connected,
  sessionEntry,
  icon,
  onOpen,
}) {
  return (
    <button
      type="button"
      className="dash-card plain-btn agent-team-card agent-team-card--external"
      onClick={onOpen}
    >
      <div className="agent-team-card__top">
        <div className="agent-team-card__identity">
          <div className={`agent-team-card__avatar agent-team-card__avatar--external ${name === "OpenClaw" ? "is-openclaw" : ""}`}>
            {icon}
          </div>
          <div className="agent-team-card__identity-text">
            <div className="agent-team-card__name">{name}</div>
            <div className="agent-team-card__subtitle">{subtitle}</div>
          </div>
        </div>
        <div className="agent-team-card__status-pills">
          <span className={`agent-team-card__status-pill ${configured ? "is-ready" : ""}`}>
            {configured ? "已配置" : "未配置"}
          </span>
          <span className={`agent-team-card__status-pill ${connected ? "is-online" : "is-offline"}`}>
            {connected ? "在线" : "离线"}
          </span>
        </div>
      </div>

      <div className="agent-team-card__meta-grid">
        <div className="agent-team-card__meta">
          <div className="agent-team-card__meta-label">来源</div>
          <div className="agent-team-card__meta-value">外部服务</div>
        </div>
        <div className="agent-team-card__meta">
          <div className="agent-team-card__meta-label">配置</div>
          <div className="agent-team-card__meta-value">{configured ? "已完成接入配置" : "尚未完成接入配置"}</div>
        </div>
        <div className="agent-team-card__meta">
          <div className="agent-team-card__meta-label">会话入口</div>
          <div className="agent-team-card__meta-value">{sessionEntry}</div>
        </div>
      </div>

      <div className="agent-team-card__footer">
        <div className="agent-team-card__workspace-count">
          <Link2 size={14} strokeWidth={2.1} />
          外部接入智能体
        </div>
        <div className="agent-team-card__cta-group">
          <div className="agent-team-card__cta">配置连接</div>
        </div>
      </div>
    </button>
  );
}

export function AgentTeamPage({
  agents,
  externalAgents,
  onOpenAgent,
  onOpenCreateAgent,
  onDeleteAgent,
  onOpenHermes,
  onOpenOpenClaw,
}) {
  const hasAgents = agents.length > 0;

  return (
    <section id="view-agent-team" className="view-container">
      <div className="page-head agent-team-page-head">
        <div className="agent-team-page-head__main">
          <h2>Agent 团队</h2>
          <p>管理你的 Agent 团队</p>
        </div>
        <div className="page-actions agent-team-page-actions">
          <button className="primary-btn compact" type="button" onClick={onOpenCreateAgent}>
            新建 Agent
          </button>
        </div>
      </div>

      {hasAgents ? (
        <div className="agent-team-section">
          <div className="agent-team-section__head">
            <h3>系统 Agent</h3>
            <p>当前由 camphorOS 直接托管的核心 Agent。</p>
          </div>
          <div className="agent-team-grid">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="dash-card plain-btn agent-team-card"
                role="button"
                tabIndex={0}
                onClick={() => onOpenAgent(agent.id)}
                onKeyDown={(event) => handleEnterSpaceActivate(event, () => onOpenAgent(agent.id))}
              >
                <div className="agent-team-card__top">
                  <div className="agent-team-card__identity">
                    <div className="agent-team-card__avatar">
                      <Bot size={20} strokeWidth={2.1} />
                    </div>
                    <div className="agent-team-card__identity-text">
                      <div className="agent-team-card__name">{agent.name}</div>
                      <div className="agent-team-card__subtitle">主会话</div>
                    </div>
                  </div>
                  <div className="agent-team-card__skill-pill">{agent.skill_count || 0} 个技能</div>
                </div>

                <div className="agent-team-card__meta-grid">
                  <div className="agent-team-card__meta">
                    <div className="agent-team-card__meta-label">专家人格</div>
                    <div className="agent-team-card__meta-value">
                      <span className={`agent-team-card__expert-tag ${agent.persona_name ? "is-active" : ""}`}>
                        {agent.persona_name || "无"}
                      </span>
                    </div>
                  </div>

                  <div className="agent-team-card__meta">
                    <div className="agent-team-card__meta-label">工作空间</div>
                    <div className="agent-team-card__meta-value">{formatWorkspaceSummary(agent)}</div>
                  </div>

                  <div className="agent-team-card__meta">
                    <div className="agent-team-card__meta-label">工作目录</div>
                    <div className="agent-team-card__meta-value agent-team-card__path">
                      {formatPathSummary(agent.effective_default_working_dir || agent.default_working_dir)}
                    </div>
                  </div>
                </div>

                <div className="agent-team-card__footer">
                  <div className="agent-team-card__footer-meta">
                    <div className="agent-team-card__workspace-count">
                      <Waypoints size={14} strokeWidth={2.1} />
                      已加入 {agent.workspace_count || 0} 个工作空间
                    </div>
                    <div className="agent-team-card__workspace-count">
                      <GitBranch size={14} strokeWidth={2.1} />
                      {agent.subagent_count || 0} 个子Agent
                    </div>
                  </div>
                  <div className="agent-team-card__cta-group">
                    <button
                      type="button"
                      className="plain-btn agent-team-card__delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteAgent?.(agent.id, agent.name);
                      }}
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                    <div className="agent-team-card__cta">查看详情</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="view-empty">当前还没有 Agent，先创建一个。</div>
      )}

      <div className="agent-team-section agent-team-section--external">
        <div className="agent-team-section__head">
          <h3>外部智能体</h3>
          <p>外部接入的智能体统一在这里查看连接状态并维护连接配置；需要更深的专属能力时，再进入各自管理页。</p>
        </div>
        <div className="agent-team-grid agent-team-grid--external">
          <ExternalAgentCard
            name="Hermes"
            subtitle="外部智能体"
            configured={Boolean(externalAgents?.hermes?.configured)}
            connected={Boolean(externalAgents?.hermes?.connected)}
            sessionEntry="工作空间群聊 / Hermes 管理页"
            icon={<Bot size={20} strokeWidth={2.1} />}
            onOpen={onOpenHermes}
          />
          <ExternalAgentCard
            name="OpenClaw"
            subtitle="外部智能体"
            configured={Boolean(externalAgents?.openclaw?.configured)}
            connected={Boolean(externalAgents?.openclaw?.connected)}
            sessionEntry="工作空间群聊 / OpenClaw 管理页"
            icon={<Zap size={20} strokeWidth={2.1} />}
            onOpen={onOpenOpenClaw}
          />
        </div>
      </div>
    </section>
  );
}
