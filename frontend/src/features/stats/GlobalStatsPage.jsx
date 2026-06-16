import {
  LayoutGrid,
  ListTodo,
  Trophy,
  BookOpen,
  Crown,
  Bot,
  Radio,
  Link,
} from "lucide-react";
import { CronManager } from "../cron/CronPage";

function StatGrid({ cards, columns = 4 }) {
  return (
    <div className="dashboard-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, padding: 0 }}>
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
  itemCount,
  submissionCount,
  knowledgeCount,
  superAgentCount,
  workAgentCount,
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
      help: "一个项目或一项工作的独立工作场所",
      icon: LayoutGrid,
      color: "#3b82f6",
      bg: "#eff6ff",
    },
    {
      title: "任务卡片",
      sub: "WorkItems",
      value: itemCount,
      desc: "当前任务总数",
      help: "用于记录和追踪各项任务与进度",
      icon: ListTodo,
      color: "#8b5cf6",
      bg: "#f5f3ff",
    },
    {
      title: "工作成果",
      sub: "Results",
      value: submissionCount,
      desc: "已同步交付物",
      help: "各空间产出的可交付物与产出物汇总",
      icon: Trophy,
      color: "#f59e0b",
      bg: "#fffbeb",
    },
    {
      title: "知识库",
      sub: "知识库",
      value: knowledgeCount,
      desc: "已挂载知识源",
      help: "为智能体提供上下文支持的知识源",
      icon: BookOpen,
      color: "#10b981",
      bg: "#ecfdf5",
    },
    {
      title: "项目经理",
      sub: "PM",
      value: superAgentCount,
      desc: "个项目经理已配置",
      help: "统筹管理工作空间各项事务的超级智能体",
      icon: Crown,
      color: "#ef4444",
      bg: "#fef2f2",
    },
    {
      title: "工作成员",
      sub: "Agents",
      value: workAgentCount,
      desc: "个实例已接入",
      help: "执行具体工作任务的专项智能体实例",
      icon: Bot,
      color: "#06b6d4",
      bg: "#ecfeff",
    },
  ];

  const externalCards = [
    {
      title: "Hermes",
      sub: "External",
      value: hermesConnected ? "在线" : "离线",
      desc: "外部连接状态",
      help: "外部消息网关，负责收发跨系统通信",
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
      help: "外部智能体网关，对接远程 AI 服务与工具",
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
        <SectionHeader title="工作空间" subtitle="已创建的工作空间、任务、成果、知识库以及已配置的智能体概况。" />
        <StatGrid cards={workspaceCards} columns={6} />
      </SectionShell>

      <SectionShell>
        <SectionHeader title="本地 Agent" subtitle="已配置的本地智能体及其运行状态。" />
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
