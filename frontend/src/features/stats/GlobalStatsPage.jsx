import {
  LayoutGrid,
  BookOpen,
  Brain,
  Bot,
  Radio,
  Link,
} from "lucide-react";
import { CronManager } from "../cron/CronPage";

function StatGrid({ cards, columns = 4 }) {
  return (
    <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, padding: 0 }}>
      {cards.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.title} className="dash-card">
            <div className="dash-manager-row" style={{ marginBottom: 14 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: s.bg,
                  color: s.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={20} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", lineHeight: 1.3 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>{s.sub}</div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.4, marginTop: 2, minHeight: 34 }}>
              {s.help}
            </div>

            <div className="big-number" style={{ color: s.color, fontSize: s.isStatus ? 32 : 42 }}>
              {s.value}
            </div>
            <p style={{ marginTop: 4 }}>{s.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16, marginTop: 24, padding: "0 40px" }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827" }}>{title}</h2>
      <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>{subtitle}</p>
    </div>
  );
}

function SectionShell({ children }) {
  return <div style={{ marginTop: 28 }}>{children}</div>;
}

export function GlobalStatsPage({
  workspaceCount,
  knowledgeCount,
  agentCount,
  hermesConnected,
  openclawConnected,
  onNavigateToHistory,
}) {
  const workspaceCards = [
    {
      title: "工作空间",
      sub: "Workspaces",
      value: workspaceCount,
      desc: "已创建的工作空间总数",
      help: "共享工作目录与群聊协作现场的数量。",
      icon: LayoutGrid,
      color: "#3b82f6",
      bg: "#eff6ff",
    },
    {
      title: "知识库",
      sub: "Knowledge",
      value: knowledgeCount,
      desc: "已挂载知识源",
      help: "为工作空间和 Agent 提供上下文支持的知识源。",
      icon: BookOpen,
      color: "#10b981",
      bg: "#ecfdf5",
    },
    {
      title: "工作成员",
      sub: "Agents",
      value: agentCount,
      desc: "个实例已接入",
      help: "当前所有工作空间里已接入的 Agent 数量。",
      icon: Bot,
      color: "#06b6d4",
      bg: "#ecfeff",
    },
    {
      title: "MOSS",
      sub: "Core",
      value: "在线",
      desc: "全局主控入口",
      help: "全局主控 Agent，负责跨工作空间的统一入口。",
      icon: Brain,
      color: "#8b5cf6",
      bg: "#f5f3ff",
      isStatus: true,
    },
  ];

  const externalCards = [
    {
      title: "Hermes",
      sub: "External",
      value: hermesConnected ? "在线" : "离线",
      desc: "外部连接状态",
      help: "外部消息网关，负责收发跨系统通信。",
      icon: Radio,
      color: hermesConnected ? "#10b981" : "#9ca3af",
      bg: hermesConnected ? "#ecfdf5" : "#f9fafb",
      isStatus: true,
    },
    {
      title: "OpenClaw",
      sub: "External",
      value: openclawConnected ? "在线" : "离线",
      desc: "外部连接状态",
      help: "外部智能体网关，对接远程 AI 服务与工具。",
      icon: Link,
      color: openclawConnected ? "#10b981" : "#9ca3af",
      bg: openclawConnected ? "#ecfdf5" : "#f9fafb",
      isStatus: true,
    },
  ];

  return (
    <section id="view-global-stats" className="view-container">
      <div className="page-head">
        <div>
          <h2>看板</h2>
          <p>所有工作空间的聚合统计与外部连接状态。</p>
        </div>
      </div>

      <SectionShell>
        <SectionHeader title="工作空间" subtitle="当前系统里已经建立的工作空间、知识源与工作成员概况。" />
        <StatGrid cards={workspaceCards} columns={4} />
      </SectionShell>

      <SectionShell>
        <SectionHeader title="外部连接" subtitle="外部智能体网关与连接状态。" />
        <div style={{ maxWidth: 840 }}>
          <StatGrid cards={externalCards} columns={2} />
        </div>
      </SectionShell>

      <SectionShell>
        <div style={{ padding: "0 40px" }}>
          <CronManager
            title="定时任务"
            subtitle="在看板里直接查看和管理所有 agent 的定时任务。"
            embedded
            showSummary
            emptyText="还没有配置任何定时任务"
            showCreateButton={false}
            showRefreshButton={false}
            onNavigateToHistory={onNavigateToHistory}
          />
        </div>
      </SectionShell>
    </section>
  );
}
