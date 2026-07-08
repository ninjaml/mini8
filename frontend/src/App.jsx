import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Bot, Zap, Store, Building2, BarChart3, Users, ListTodo, MessageSquare } from "lucide-react";
import { AppRail } from "./components/layout/AppRail";
import { ClawSidebar } from "./components/layout/ClawSidebar";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { AgentPage } from "./features/workspace/AgentPage";
import { OfficePage } from "./features/workspace/OfficePage";
import { getOfficeSelectionState } from "./features/workspace/office/officeSelection";
import { KnowledgePage } from "./features/workspace/KnowledgePage";
import { ChatHubPage } from "./features/workspace/ChatHubPage";
import { useWorkspaceMessages } from "./features/workspace/useWorkspaceMessages";
import { GlobalPage } from "./features/global/GlobalPage";
import { GlobalStatsPage } from "./features/stats/GlobalStatsPage";
import { ConfirmModal } from "./features/modals/ConfirmModal";
import { CreateAgentModal } from "./features/modals/CreateAgentModal";
import { CreateKnowledgeModal } from "./features/modals/CreateKnowledgeModal";
import { CreateWorkspaceModal } from "./features/modals/CreateWorkspaceModal";
import SettingsModal from "./features/modals/SettingsModal";
import { AIMarketView } from "./features/ai-market/AIMarketView";
import { HomeView } from "./features/home/HomeView";
import HermesPage from "./features/hermes/HermesPage";
import { hermesApi } from "./features/hermes/hermesApi";
import ScenePage from "./features/scene/ScenePage";
import { OpenClawPage, openclawApi } from "./features/openclaw";
import { openclawGateway } from "./features/openclaw/openclawGateway";
import { openclawConfigApi } from "./features/openclaw/openclawConfigApi";
import { AgentTeamPage } from "./features/agent-team/AgentTeamPage";
import { AgentTeamDetailPage } from "./features/agent-team/AgentTeamDetailPage";
import { AgentTeamConfigModal } from "./features/agent-team/AgentTeamConfigModal";
import { ExternalAgentConfigModal } from "./features/agent-team/ExternalAgentConfigModal";
import { WorkspaceAgentPersonaModal } from "./features/workspace/WorkspaceAgentPersonaModal";
import { PersonaCatalogPage } from "./features/persona/PersonaCatalogPage";
import { useRuntimeChat } from "./features/chat/useRuntimeChat";
import { usePersistentWorkspaceAgentChats } from "./features/chat/usePersistentWorkspaceAgentChats";
import { CronHistoryPage } from "./features/cron/CronHistoryPage";
import { CronManager } from "./features/cron/CronPage";
import { isHermesConfigured, isOpenClawConfigured } from "./features/external-agents/configStatus";
import {
  clearStoredAuth,
  getCurrentUserDisplayName,
  getCurrentUserLabel,
  getStoredAuth,
  setStoredAuth,
} from "./lib/auth";
import { buildWorkspaceShellFromApi, hydrateWorkspaceShellsFromApi } from "./lib/builders";
import { buildWorkspaceViewState } from "./lib/workspaceViewState.js";
import { api } from "./lib/api";
import {
  findAgentById,
  getAgentDefaultSessionId,
  getAgentWorkspaceSessionId,
  getAgentWorkspaceSessionSubagentMode,
} from "./lib/agentSessions.js";
import { updateAgentModel } from "./lib/agents.js";

const defaultLoginForm = { username: "", password: "" };
const defaultWorkspaceForm = { name: "", goal: "", working_dir: "" };
const defaultAgentForm = { name: "", agent_id: "" };
const defaultKnowledgeForm = { name: "", port: "", api_key: "", omnisearch_port: "" };
const emptyRuntimeMessages = [];
const emptyConfirmState = {
  open: false,
  title: "",
  message: "",
  confirmLabel: "确认",
  confirmTone: "danger",
  error: "",
  action: null,
};

const externalLinkTargets = {
  skillRepo: {
    title: "打开 资源包",
    message:
      "资源包是 Agent 能力包、工作模板和智能资源的集合。你可以在这里发现、获取和复用适合自己场景的能力，让你的 Agent 获得更明确的工作方法、工具边界和执行流程。",
    confirmLabel: "前往 资源包",
    url: "https://ep2048.cn/market/index.html",
  },
  agentPlayground: {
    title: "打开 Agent Playground",
    message:
      "Agent Playground 是 Agent 竞技场。你可以让 Agent 在这里完成各种任务和测试，观察它的执行能力、稳定性和问题解决水平，用来锻炼和评估 Agent。",
    confirmLabel: "前往竞技场",
    url: "",
  },
  joyCommunity: {
    title: "打开乔伊来了社区",
    message:
      "乔伊来了社区是面向工作场景的 AI 学习社区。这里会沉淀 AI 工具、Agent 工作流、实战案例和学习资源，帮助你把 AI 融合到真实工作里。",
    confirmLabel: "前往社区",
    url: "https://www.camphorjoy.com/",
  },
};

const defaultViewState = {
  viewId: "global_stats",
  wsId: null,
  selectedAgentId: null,
  selectedGlobalAgentId: null,
  selectedKnowledgeId: null,
  chatHubAgentId: null,
};

// 保留 home/intro 页面的备用入口代码，供后续需要时复用。
// 当前导航与登录流程里故意不暴露它。
const SHOW_HOME_VIEW = false;

function LoginScreen({ visible, form, error, onChange, onSubmit }) {
  if (!visible) return null;

  return (
    <div className="login-screen">
      <div className="login-panel">
        <div className="login-left">
          <img src="/logo.png" alt="Mini8" className="login-logo-large" />
        </div>
        <div className="login-right">
          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label className="form-label" htmlFor="login-username">
              账号
            </label>
            <input
              id="login-username"
              className="form-input"
              value={form.username}
              onChange={(event) => onChange("username", event.target.value)}
              placeholder="手机号 / 用户名"
            />

            <label className="form-label" htmlFor="login-password">
              密码
            </label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              value={form.password}
              onChange={(event) => onChange("password", event.target.value)}
              placeholder="请输入密码"
            />

            {error ? <div className="login-error">{error}</div> : null}
            <button className="primary-btn login-submit" type="submit">
              登录
            </button>
          </form>
          <div className="login-register-hint">
            请前往
            <a
              href="https://www.camphorjoy.com/register"
              target="_blank"
              rel="noopener noreferrer"
            >
              Camphor开源社区
            </a>
            ，免费注册你的账号。
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => getStoredAuth());
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [loginError, setLoginError] = useState("");
  const [workspaces, setWorkspaces] = useState([]);
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const manageType = urlParams.get('manage'); // 'workspace', 'hermes', 'openclaw', or null
  const isManageWindow = !!manageType;
  const manageWsId = manageType === 'workspace' ? urlParams.get('wsId') : null;
  const initialViewFromUrl = urlParams.get('view');
  const initialAgentIdFromUrl = urlParams.get('agentId');
  const initialAgentSessionIdFromUrl = urlParams.get('agentSessionId');
  const initialDefaultJobIdFromUrl = urlParams.get('defaultJobId');

  const [viewState, setViewState] = useState(() => {
    if (manageType === 'workspace' && manageWsId) {
      return {
        ...defaultViewState,
        viewId: initialViewFromUrl || "ws_office",
        wsId: manageWsId,
        selectedAgentId: initialAgentIdFromUrl || null,
        chatHubAgentId: initialAgentIdFromUrl || null,
      };
    }
    if (manageType === 'hermes') {
      return {
        ...defaultViewState,
        viewId: "hermes",
      };
    }
    if (manageType === 'openclaw') {
      return {
        ...defaultViewState,
        viewId: "openclaw",
      };
    }
    if (initialViewFromUrl === 'global') {
      return { ...defaultViewState, viewId: "global" };
    }
    return defaultViewState;
  });
  const [loading, setLoading] = useState(false);
  const [appError, setAppError] = useState("");
  const [agentTeamLoading, setAgentTeamLoading] = useState(false);
  const [agentTeamError, setAgentTeamError] = useState("");
  const [subagentModeSaving, setSubagentModeSaving] = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const userPanelRef = useRef(null);

  useEffect(() => {
    if (!userPanelOpen) return;
    const handleClickOutside = (e) => {
      if (userPanelRef.current && !userPanelRef.current.contains(e.target)) {
        setUserPanelOpen(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userPanelOpen]);

  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceModalMode, setWorkspaceModalMode] = useState("create");
  const [workspaceForm, setWorkspaceForm] = useState(defaultWorkspaceForm);
  const [workspaceFormError, setWorkspaceFormError] = useState("");
  const [pickingWorkspaceWorkingDir, setPickingWorkspaceWorkingDir] = useState(false);

  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentForm, setAgentForm] = useState(defaultAgentForm);
  const [agentFormError, setAgentFormError] = useState("");
  const [agentModalMode, setAgentModalMode] = useState("workspace");

  const [globalAgents, setGlobalAgents] = useState([]);
  const [globalAgentDetail, setGlobalAgentDetail] = useState(null);
  const [globalAgentSubagents, setGlobalAgentSubagents] = useState([]);
  const [globalAgentSubagentsLoading, setGlobalAgentSubagentsLoading] = useState(false);
  const [globalAgentSubagentsSaving, setGlobalAgentSubagentsSaving] = useState(false);
  const [personaCatalog, setPersonaCatalog] = useState([]);
  const [agentConfigOpen, setAgentConfigOpen] = useState(false);
  const [agentConfigInitialTab, setAgentConfigInitialTab] = useState("basic");
  const [agentConfigSaving, setAgentConfigSaving] = useState(false);
  const [agentConfigError, setAgentConfigError] = useState("");
  const [externalAgentConfigType, setExternalAgentConfigType] = useState(null);
  const [agentConfigForm, setAgentConfigForm] = useState({
    name: "",
    default_working_dir: "",
    persona_name: null,
    runtime_agent_name: "",
    model_provider: "",
    model_name: "",
    base_url: "",
  });

  function shouldRefreshPersonaCatalog(items) {
    if (!Array.isArray(items) || items.length === 0) return true;
    return items.some((item) => !String(item?.persona_dir || "").trim());
  }

  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [knowledgeForm, setKnowledgeForm] = useState(defaultKnowledgeForm);
  const [knowledgeFormError, setKnowledgeFormError] = useState("");

  const [confirmState, setConfirmState] = useState(emptyConfirmState);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [workspaceSettingsModalOpen, setWorkspaceSettingsModalOpen] = useState(false);
  const [isRefreshingWorkspaces, setIsRefreshingWorkspaces] = useState(false);
  const [isRefreshingAgents, setIsRefreshingAgents] = useState(false);
  const [isRefreshingItems, setIsRefreshingItems] = useState(false);
  const [isRefreshingKnowledge, setIsRefreshingKnowledge] = useState(false);

  const [cronHistoryEntryMap, setCronHistoryEntryMap] = useState({});
  const [cronHistoryContext, setCronHistoryContext] = useState(null);
  const [workspaceCronCreateSignal, setWorkspaceCronCreateSignal] = useState(0);
  const [workspaceTaskBoardPendingAction, setWorkspaceTaskBoardPendingAction] = useState(null);
  const [workspaceTaskFocusAgentSessionId, setWorkspaceTaskFocusAgentSessionId] = useState(null);
  const [workspaceAgentDetailAgentId, setWorkspaceAgentDetailAgentId] = useState(null);
  const [workspaceAgentPersonaOpen, setWorkspaceAgentPersonaOpen] = useState(false);

  const [externalAgents, setExternalAgents] = useState({
    openclaw: { configured: false, connected: false },
    hermes: { configured: false, connected: false, agent: null },
  });

  const [knowledgeBrowser, setKnowledgeBrowser] = useState({
    loading: false,
    error: "",
    currentPath: "",
    entries: [],
    selectedFilePath: "",
    selectedFile: null,
    workspaceName: "",
  });

  const [consoleDraft, setConsoleDraft] = useState("");
  const [selectedChatTarget, setSelectedChatTarget] = useState("moss");
  const [seenMossCompletionAt, setSeenMossCompletionAt] = useState(0);
  const [seenWorkspaceAgentCompletionById, setSeenWorkspaceAgentCompletionById] = useState({});

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === String(viewState.wsId)) || null,
    [workspaces, viewState.wsId],
  );
  const currentKnowledge = useMemo(
    () =>
      currentWorkspace?.knowledge.find((entry) => entry.id === viewState.selectedKnowledgeId) ||
      currentWorkspace?.knowledge[0] ||
      null,
    [currentWorkspace, viewState.selectedKnowledgeId],
  );

  const workspaceMessages = useWorkspaceMessages({
    workspaceId: currentWorkspace?.rawId ?? null,
    agents: currentWorkspace?.agents || [],
    enabled: viewState.viewId === "ws_chat_hub",
  });
  const selectedAgent = useMemo(
    () =>
      currentWorkspace?.agents.find((agent) => agent.id === viewState.selectedAgentId) ||
      currentWorkspace?.agents[0] ||
      null,
    [currentWorkspace, viewState.selectedAgentId],
  );
  const currentWorkspaceRawId = currentWorkspace?.rawId ?? (currentWorkspace ? Number(currentWorkspace.id) : null);
  const selectedGlobalAgent = useMemo(
    () => globalAgents.find((agent) => Number(agent.id) === Number(viewState.selectedGlobalAgentId)) || null,
    [globalAgents, viewState.selectedGlobalAgentId],
  );

  const agentSessionIndex = useMemo(() => {
    const map = new Map();
    for (const workspace of workspaces) {
      const workspaceId = workspace.rawId ?? Number(workspace.id);
      for (const agent of workspace.agents || []) {
        const workspaceSessionId = getAgentWorkspaceSessionId(agent);
        if (workspaceSessionId != null) {
          map.set(Number(workspaceSessionId), {
            scopeType: "agent",
            workspaceId,
            workspaceName: workspace.name,
            agentName: agent.name,
            agentId: Number(agent.id),
          });
        }
      }
    }
    return map;
  }, [workspaces]);

  const displayName = getCurrentUserDisplayName(auth);
  const displayLabel = getCurrentUserLabel(auth);

  const chatTargetConfig = useMemo(() => {
    if (viewState.viewId === "global") {
      return {
        disabled: false,
        options: [{ value: "moss", label: "MOSS" }],
        selected: "moss",
      };
    }
    if (viewState.viewId === "agent_team") {
      return {
        disabled: true,
        options: [{ value: "", label: "Agent 团队" }],
        selected: "",
      };
    }
    if (viewState.viewId === "agent_team_detail") {
      return {
        disabled: false,
        options: [{ value: "agent", label: globalAgentDetail?.name || selectedGlobalAgent?.name || "Agent" }],
        selected: "agent",
      };
    }
    if (!currentWorkspace) {
      return {
        disabled: true,
        options: [{ value: "", label: "当前没有可用对话对象" }],
        selected: "",
      };
    }
    if (viewState.viewId === "ws_office" || viewState.viewId === "ws_kb") {
      return {
        disabled: false,
        options: [{ value: "moss", label: "MOSS" }],
        selected: "moss",
      };
    }
    if (viewState.viewId === "ws_agents") {
      return {
        disabled: false,
        options: [{ value: "agent", label: selectedAgent?.name || "Agent" }],
        selected: "agent",
      };
    }
    if (viewState.viewId === "global_stats") {
      return {
        disabled: true,
        options: [{ value: "", label: "统计总览" }],
        selected: "",
      };
    }
    if (viewState.viewId === "ws_chat_hub") {
      return {
        disabled: false,
        options: [{ value: "workspace", label: "指令下达" }],
        selected: "workspace",
      };
    }
    return {
      disabled: false,
      options: [{ value: "moss", label: "MOSS" }],
      selected: "moss",
    };
  }, [currentWorkspace, viewState.viewId, globalAgentDetail?.name, selectedGlobalAgent?.name]);

  const activeChatTarget = useMemo(() => {
    const optionValues = new Set(chatTargetConfig.options.map((option) => option.value));
    if (!selectedChatTarget || !optionValues.has(selectedChatTarget)) {
      return chatTargetConfig.selected || chatTargetConfig.options[0]?.value || "";
    }
    return selectedChatTarget;
  }, [chatTargetConfig, selectedChatTarget]);

  // Only enable chat connections on workspace-related views
  const isWorkspaceView = viewState.viewId === "home" || viewState.viewId?.startsWith("ws_");

  // Create separate runtime chat instances for each context to maintain persistent connections
  const mossChat = useRuntimeChat({
    contextKey: "moss",
    contextKind: "moss",
    workspaceId: null,
    disabled: isManageWindow,
    displayName: "MOSS",
    fallbackMessages: emptyRuntimeMessages,
  });

  const globalAgentDefaultSessionId = getAgentDefaultSessionId(globalAgentDetail);
  // Agent 团队详情页现在直接挂到“默认 AgentSession”的 runtime 聊天，
  // 不再走另一套全局持久聊天实现，避免工作空间与 default session 表现分叉。
  const selectedGlobalAgentDefaultChat = useRuntimeChat({
    contextKey: globalAgentDefaultSessionId
      ? `global-agent-default-session-${globalAgentDefaultSessionId}`
      : "global-agent-default-session-empty",
    contextKind: null,
    agentSessionId: globalAgentDefaultSessionId,
    disabled: isManageWindow || viewState.viewId !== "agent_team_detail" || !globalAgentDefaultSessionId,
    displayName: globalAgentDetail?.name || selectedGlobalAgent?.name || "Agent",
    fallbackMessages: emptyRuntimeMessages,
  });

  const showMossChatBadge =
    Boolean(mossChat.lastCompletedAt) && mossChat.lastCompletedAt > seenMossCompletionAt && viewState.viewId !== "global";

  useEffect(() => {
    if (viewState.viewId === "global" && mossChat.lastCompletedAt) {
      setSeenMossCompletionAt((prev) => Math.max(prev, mossChat.lastCompletedAt));
    }
  }, [viewState.viewId, mossChat.lastCompletedAt]);

  const workspaceAgentChatCurrentAgentId = useMemo(() => {
    if (viewState.viewId === "ws_agents") return viewState.selectedAgentId;
    if (viewState.viewId === "ws_chat_hub") {
      // 外部智能体不占用 workspace agent chat 槽位
      if (viewState.chatHubAgentId === "__openclaw__" || viewState.chatHubAgentId === "__hermes__") {
        return null;
      }
      return viewState.chatHubAgentId;
    }
    return null;
  }, [viewState.viewId, viewState.selectedAgentId, viewState.chatHubAgentId]);

  const officePriorityAgentIds = useMemo(() => {
    if (viewState.viewId !== "ws_office") return [];
    return (currentWorkspace?.agents || []).slice(0, 6).map((agent) => agent.id);
  }, [viewState.viewId, currentWorkspace?.agents]);

  const workspaceAgentChat = usePersistentWorkspaceAgentChats(
    currentWorkspace?.agents || [],
    workspaceAgentChatCurrentAgentId,
    currentWorkspace ? String(currentWorkspace.id) : null,
    !isWorkspaceView,
    officePriorityAgentIds,
  );
  const workspaceAgentCompletionById = workspaceAgentChat.completionByAgentId || {};

  const workspaceAgentChatBadgeById = useMemo(() => {
    if (!currentWorkspace?.agents) return {};
    return Object.fromEntries(
      currentWorkspace.agents.map((agent) => {
        const completedAt = workspaceAgentCompletionById[String(agent.id)] || 0;
        const seenAt = seenWorkspaceAgentCompletionById[String(agent.id)] || 0;
        const isCurrentAgent = (viewState.viewId === "ws_agents" && String(viewState.selectedAgentId) === String(agent.id)) || (viewState.viewId === "ws_chat_hub" && String(viewState.chatHubAgentId) === String(agent.id));
        return [String(agent.id), Boolean(completedAt) && completedAt > seenAt && !isCurrentAgent];
      }),
    );
  }, [currentWorkspace?.agents, workspaceAgentCompletionById, seenWorkspaceAgentCompletionById, viewState.viewId, viewState.selectedAgentId]);

  const globalStats = useMemo(() => {
    const workspaceCount = workspaces.length;
    const knowledgeCount = workspaces.reduce((sum, w) => sum + (w.knowledge?.length || 0), 0);
    const agentCount = workspaces.reduce((sum, w) => sum + (w.agents?.length || 0), 0);
    return {
      workspaceCount,
      knowledgeCount,
      agentCount,
      hermesConnected: externalAgents.hermes.connected,
      openclawConnected: externalAgents.openclaw.connected,
    };
  }, [workspaces, externalAgents]);

  const workspaceChatBadgeByWorkspaceId = useMemo(() => {
    return Object.fromEntries(
      workspaces.map((workspace) => {
        let hasWorkspaceAgentBadge = false;
        if (currentWorkspace && String(currentWorkspace.id) === String(workspace.id) && workspaceAgentChatBadgeById) {
          hasWorkspaceAgentBadge = Object.values(workspaceAgentChatBadgeById).some(Boolean);
        }
        return [workspace.id, hasWorkspaceAgentBadge];
      }),
    );
  }, [workspaces, workspaceAgentChatBadgeById, currentWorkspace]);

  useEffect(() => {
    const currentAgentId =
      viewState.viewId === "ws_agents"
        ? viewState.selectedAgentId
        : viewState.viewId === "ws_chat_hub"
        ? viewState.chatHubAgentId
        : null;
    if (
      (viewState.viewId !== "ws_agents" && viewState.viewId !== "ws_chat_hub") ||
      !currentAgentId
    )
      return;
    const completedAt = workspaceAgentCompletionById[currentAgentId] || 0;
    if (!completedAt) return;
    setSeenWorkspaceAgentCompletionById((prev) => ({
      ...prev,
      [currentAgentId]: Math.max(prev[currentAgentId] || 0, completedAt),
    }));
  }, [viewState.viewId, viewState.selectedAgentId, viewState.chatHubAgentId, workspaceAgentCompletionById]);

  const activeRuntimeChat = useMemo(() => {
    if (viewState.viewId === "global_stats") {
      return mossChat;
    }
    if (viewState.viewId === "global") {
      return mossChat;
    }
    if (viewState.viewId === "agent_team_detail") {
      return selectedGlobalAgentDefaultChat;
    }
    if (viewState.viewId === "ws_agents") {
      return workspaceAgentChat;
    }
    if (viewState.viewId === "ws_chat_hub") {
      if (viewState.chatHubAgentId === "__openclaw__" || viewState.chatHubAgentId === "__hermes__") {
        // 外部智能体聊天在 ChatHubPage 内部自行管理，这里返回 mossChat 作为占位
        return mossChat;
      }
      return workspaceAgentChat;
    }
    return mossChat;
  }, [viewState.viewId, mossChat, selectedGlobalAgentDefaultChat, workspaceAgentChat, viewState.chatHubAgentId]);

  const agentTeamDetailCronContext = useMemo(() => {
    if (viewState.viewId !== "agent_team_detail" || !globalAgentDefaultSessionId) {
      return null;
    }
    return {
      kind: "agent_session",
      agentRefId: globalAgentDetail.id,
      agentSessionId: globalAgentDefaultSessionId,
      agentName: globalAgentDetail.name || "Agent",
      defaultJobId: null,
    };
  }, [viewState.viewId, globalAgentDetail?.id, globalAgentDefaultSessionId, globalAgentDetail?.name]);

  useEffect(() => {
    if (!isManageWindow) return;
    // 优先根据当前实际视图设置 title（用户可能在 workspace 管理窗口中切换到 hermes/openclaw）
    if (viewState.viewId === 'hermes') {
      document.title = 'Hermes - 管理';
    } else if (viewState.viewId === 'openclaw') {
      document.title = 'OpenClaw - 管理';
    } else if (manageType === 'workspace' && currentWorkspace) {
      document.title = `${currentWorkspace.name} - 管理`;
    } else if (manageType === 'hermes') {
      document.title = 'Hermes - 管理';
    } else if (manageType === 'openclaw') {
      document.title = 'OpenClaw - 管理';
    }
  }, [isManageWindow, manageType, currentWorkspace, viewState.viewId]);

  useEffect(() => {
    if (!auth) return;
    setLoading(true);
    Promise.all([
      hydrateWorkspaceShellsFromApi(),
      api.getAgentTeam().catch(() => []),
    ])
      .then(([data, agentTeam]) => {
        setWorkspaces(data);
        setGlobalAgents(agentTeam || []);
        if (manageType === 'workspace' && manageWsId && initialViewFromUrl === 'cron_history') {
          if (initialAgentSessionIdFromUrl) {
            const sessionId = Number(initialAgentSessionIdFromUrl);
            const meta = data.reduce((found, workspace) => {
              if (found) return found;
              const agent = (workspace.agents || []).find(
                (entry) => Number(getAgentWorkspaceSessionId(entry)) === sessionId,
              );
              if (!agent) return null;
              return {
                workspace,
                scopeType: "agent",
                agentId: Number(agent.id),
                agentName: agent.name || "Agent",
              };
            }, null);
            setCronHistoryContext({
              kind: "agent_session",
              agentRefId: meta?.agentId ?? null,
              agentSessionId: sessionId,
              workspaceId: meta?.workspace?.rawId ?? Number(manageWsId),
              agentName: meta?.agentName || "Agent",
              defaultJobId: initialDefaultJobIdFromUrl ? Number(initialDefaultJobIdFromUrl) : undefined,
            });
          } else if (initialAgentIdFromUrl) {
            const ws = data.find((workspace) =>
              (workspace.agents || []).some((a) => String(a.id) === String(initialAgentIdFromUrl)),
            );
            const agent = ws?.agents?.find((a) => String(a.id) === String(initialAgentIdFromUrl));
            setCronHistoryContext({
              kind: "agent_session",
              agentRefId: Number(initialAgentIdFromUrl),
              agentSessionId: getAgentWorkspaceSessionId(agent),
              workspaceId: ws?.rawId ?? Number(manageWsId),
              agentName: agent?.name || "Agent",
              defaultJobId: initialDefaultJobIdFromUrl ? Number(initialDefaultJobIdFromUrl) : undefined,
            });
          }
        }
        setViewState((prev) => {
          if (prev.wsId || !data[0]) return prev;
          return {
            ...prev,
            viewId: prev.viewId === "home" ? "global_stats" : prev.viewId,
            wsId: data[0].id,
            selectedKnowledgeId: data[0].knowledge[0]?.id || null,
          };
        });
      })
      .catch((error) => setAppError(error.message))
      .finally(() => setLoading(false));
  }, [auth]);

  // 定时刷新工作空间列表（30秒间隔）——只刷新轻量列表，不拉详细数据
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    if (!auth) return;

    const REFRESH_INTERVAL = 30000; // 30秒

    const refreshWorkspaces = async () => {
      const now = Date.now();
      // 忽略 2 秒内的重复请求（防止竞态条件）
      if (now - lastRefreshRef.current < 2000) return;
      lastRefreshRef.current = now;

      try {
        const list = await api.getWorkspaces();
        setWorkspaces((prev) => {
          const prevById = new Map(prev.map((ws) => [String(ws.id), ws]));
          return list.map((raw) => {
            const id = String(raw.id);
            const existing = prevById.get(id);
            if (existing) {
              return {
                ...existing,
                name: raw.name,
                goal: raw.goal || existing.goal,
              };
            }
            return {
              id,
              rawId: raw.id,
              name: raw.name,
              goal: raw.goal || "待补充工作总目标",
              agents: [],
              knowledge: [],
            };
          });
        });
      } catch (error) {
        console.error("定时刷新失败:", error);
      }
    };

    const intervalId = setInterval(refreshWorkspaces, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [auth]);

  // 工作空间视图下定时刷新当前空间详情。
  useEffect(() => {
    if (!auth || !currentWorkspace?.rawId) return;
    if (!viewState.viewId.startsWith("ws_")) return;

    const REFRESH_INTERVAL = 30000;
    const refreshDetail = async () => {
      try {
        await reloadCurrentWorkspaceShell();
      } catch (error) {
        console.error("定时刷新工作空间详情失败:", error);
      }
    };

    const intervalId = setInterval(refreshDetail, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, currentWorkspace?.rawId, viewState.viewId]);

  // 手动刷新工作空间列表
  async function handleRefreshWorkspaces() {
    if (isRefreshingWorkspaces) return;
    setIsRefreshingWorkspaces(true);
    try {
      const data = await hydrateWorkspaceShellsFromApi();
      setWorkspaces(data);
    } catch (error) {
      console.error("手动刷新失败:", error);
    } finally {
      setIsRefreshingWorkspaces(false);
    }
  }

  async function handleRefreshAgentTeam() {
    setAgentTeamLoading(true);
    setAgentTeamError("");
    try {
      const team = await api.getAgentTeam();
      setGlobalAgents(team || []);
      return team || [];
    } catch (error) {
      setAgentTeamError(error.message || "加载 Agent 团队失败");
      return [];
    } finally {
      setAgentTeamLoading(false);
    }
  }

  async function loadGlobalAgentSubagents(agentId) {
    if (!agentId) {
      setGlobalAgentSubagents([]);
      return [];
    }
    setGlobalAgentSubagentsLoading(true);
    try {
      const bindings = await api.listAgentSubagents(agentId);
      const nextBindings = Array.isArray(bindings) ? bindings : [];
      setGlobalAgentSubagents(nextBindings);
      return nextBindings;
    } catch (error) {
      setGlobalAgentSubagents([]);
      throw error;
    } finally {
      setGlobalAgentSubagentsLoading(false);
    }
  }

  async function loadGlobalAgentDetail(agentId) {
    if (!agentId) {
      setGlobalAgentDetail(null);
      setGlobalAgentSubagents([]);
      return null;
    }
    setAgentTeamLoading(true);
    setGlobalAgentSubagentsLoading(true);
    setAgentTeamError("");
    try {
      const [detail, personas, subagents] = await Promise.all([
        api.getAgentTeamDetail(agentId),
        shouldRefreshPersonaCatalog(personaCatalog) ? api.getPersonas() : Promise.resolve(personaCatalog),
        api.listAgentSubagents(agentId),
      ]);
      setGlobalAgentDetail(detail);
      setGlobalAgentSubagents(Array.isArray(subagents) ? subagents : []);
      if (Array.isArray(personas)) {
        setPersonaCatalog(personas);
      }
      return detail;
    } catch (error) {
      setAgentTeamError(error.message || "加载 Agent 详情失败");
      setGlobalAgentSubagents([]);
      return null;
    } finally {
      setAgentTeamLoading(false);
      setGlobalAgentSubagentsLoading(false);
    }
  }

  // 刷新 Agent 列表
  async function handleRefreshAgents() {
    if (isRefreshingAgents || !currentWorkspace?.rawId) return;
    setIsRefreshingAgents(true);
    try {
      await reloadCurrentWorkspaceShell();
    } catch (error) {
      console.error("刷新Agent列表失败:", error);
    } finally {
      setIsRefreshingAgents(false);
    }
  }

  // 刷新知识库列表
  async function handleRefreshKnowledge() {
    if (isRefreshingKnowledge || !currentWorkspace?.rawId) return;
    setIsRefreshingKnowledge(true);
    try {
      await reloadCurrentWorkspaceShell();
    } catch (error) {
      console.error("刷新知识库列表失败:", error);
    } finally {
      setIsRefreshingKnowledge(false);
    }
  }

  useEffect(() => {
    if (!auth) return;
    if (viewState.viewId !== "agent_team_detail") return;
    if (!viewState.selectedGlobalAgentId) return;
    loadGlobalAgentDetail(viewState.selectedGlobalAgentId);
  }, [auth, viewState.viewId, viewState.selectedGlobalAgentId]);

  useEffect(() => {
    setWorkspaceAgentDetailAgentId(null);
    setWorkspaceAgentPersonaOpen(false);
  }, [currentWorkspace?.id]);

  useEffect(() => {
    if (!workspaceAgentPersonaOpen) return;
    if (!shouldRefreshPersonaCatalog(personaCatalog)) return;
    let cancelled = false;
    api.getPersonas()
      .then((personas) => {
        if (!cancelled && Array.isArray(personas)) {
          setPersonaCatalog(personas);
        }
      })
      .catch(() => {
        // 保持空列表即可，弹框里仍然可以保存为“无专家人格”。
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceAgentPersonaOpen, personaCatalog]);

  useEffect(() => {
    if (viewState.viewId !== "biz_expert") return;
    if (!shouldRefreshPersonaCatalog(personaCatalog)) return;
    let cancelled = false;
    api.getPersonas()
      .then((personas) => {
        if (!cancelled && Array.isArray(personas)) {
          setPersonaCatalog(personas);
        }
      })
      .catch(() => {
        // 保持空列表，由页面直接展示空态。
      });
    return () => {
      cancelled = true;
    };
  }, [viewState.viewId, personaCatalog]);

  useEffect(() => {
    setSelectedChatTarget(chatTargetConfig.selected || chatTargetConfig.options[0]?.value || "");
    // 只在切换视图或工作空间时清空输入框，不在刷新数据时清空
  }, [chatTargetConfig.selected, chatTargetConfig.options, viewState.viewId, viewState.wsId]);

  useEffect(() => {
    async function loadKnowledgeTree() {
      if (viewState.viewId !== "ws_kb" || !currentKnowledge) return;
      setKnowledgeBrowser((prev) => ({
        ...prev,
        loading: true,
        error: "",
        workspaceName: currentWorkspace?.name || "",
      }));
      try {
        const tree = await api.getKnowledgeTree(currentKnowledge.id, "");
        setKnowledgeBrowser((prev) => ({
          ...prev,
          loading: false,
          currentPath: tree.current_path || "",
          entries: tree.entries || [],
          selectedFilePath: "",
          selectedFile: null,
          workspaceName: currentWorkspace?.name || "",
        }));
      } catch (error) {
        setKnowledgeBrowser((prev) => ({
          ...prev,
          loading: false,
          error: error.message,
          entries: [],
          selectedFilePath: "",
          selectedFile: null,
          workspaceName: currentWorkspace?.name || "",
        }));
      }
    }

    loadKnowledgeTree();
  }, [viewState.viewId, currentKnowledge?.id, currentWorkspace?.name]);

  function handleLoginField(field, value) {
    setLoginForm((prev) => ({ ...prev, [field]: value }));
    setLoginError("");
  }

  async function handleLogin() {
    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      setLoginError("请输入账号和密码。");
      return;
    }

    try {
      const response = await api.login({
        username: loginForm.username.trim(),
        password: loginForm.password,
      });
      if (!response?.success) {
        setLoginError(response?.message || "登录失败。");
        return;
      }
      const nextAuth = {
        username: loginForm.username.trim(),
        user_id: response.user_id ?? null,
        nickname: response.nickname ?? null,
      };
      setStoredAuth(nextAuth);
      setAuth(nextAuth);
      setLoginForm(defaultLoginForm);
      setLoginError("");
    } catch (error) {
      setLoginError(error.message || "登录失败。");
    }
  }

  function handleLogout() {
    clearStoredAuth();
    setAuth(null);
    setWorkspaces([]);
    setGlobalAgents([]);
    setGlobalAgentDetail(null);
    setGlobalAgentSubagents([]);
    setPersonaCatalog([]);
    setViewState(defaultViewState);
    setUserPanelOpen(false);
  }

  function handleWorkspaceField(field, value) {
    setWorkspaceForm((prev) => ({ ...prev, [field]: value }));
    setWorkspaceFormError("");
  }

  async function handlePickWorkspaceWorkingDir() {
    try {
      setPickingWorkspaceWorkingDir(true);
      setWorkspaceFormError("");
      const result = await api.pickWorkspaceWorkingDir();
      if (!result?.path) return;
      setWorkspaceForm((prev) => ({ ...prev, working_dir: result.path }));
    } catch (error) {
      setWorkspaceFormError(error.message || "选择工作目录失败。");
    } finally {
      setPickingWorkspaceWorkingDir(false);
    }
  }


  function handleAgentField(field, value) {
    setAgentForm((prev) => ({ ...prev, [field]: value }));
    setAgentFormError("");
  }

  function openCreateWorkspaceAgentModal() {
    setAgentModalMode("workspace");
    setAgentForm(defaultAgentForm);
    setAgentFormError("");
    setAgentModalOpen(true);
  }

  function openCreateGlobalAgentModal() {
    setAgentModalMode("global");
    setAgentForm(defaultAgentForm);
    setAgentFormError("");
    setAgentModalOpen(true);
  }

  function handleKnowledgeField(field, value) {
    setKnowledgeForm((prev) => ({ ...prev, [field]: value }));
    setKnowledgeFormError("");
  }


  async function handleCreateWorkspace() {
    const name = workspaceForm.name.trim();
    const goal = workspaceForm.goal.trim();
    const workingDir = workspaceForm.working_dir.trim();

    if (!name || !goal || !workingDir) {
      setWorkspaceFormError("请先填写名称、核心目标和工作目录。");
      return;
    }

    try {
      const created = await api.createWorkspace({
        ...workspaceForm,
        user_id: auth?.user_id ?? null,
        name,
        goal,
        working_dir: workingDir,
      });
      const nextWorkspace = await buildWorkspaceShellFromApi(created);
      setWorkspaces((prev) => [...prev, nextWorkspace]);
      setViewState({
        ...defaultViewState,
        ...buildWorkspaceViewState(nextWorkspace),
      });
      setWorkspaceModalOpen(false);
      setWorkspaceForm(defaultWorkspaceForm);
      setWorkspaceFormError("");
      setWorkspaceModalMode("create");
    } catch (error) {
      setWorkspaceFormError(error.message);
    }
  }

  async function handleUpdateWorkspace() {
    if (!currentWorkspace?.rawId) return;
    const name = workspaceForm.name.trim();
    const goal = workspaceForm.goal.trim();
    const workingDir = workspaceForm.working_dir.trim();

    if (!name) {
      setWorkspaceFormError("工作空间名称不能为空。");
      return;
    }
    if (!workingDir) {
      setWorkspaceFormError("工作目录不能为空。");
      return;
    }

    try {
      const updated = await api.updateWorkspace(currentWorkspace.rawId, {
        name,
        goal,
        working_dir: workingDir,
      });
      const nextWorkspace = {
        ...(await buildWorkspaceShellFromApi(updated)),
        };
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === nextWorkspace.id ? nextWorkspace : ws
        )
      );
      setWorkspaceModalOpen(false);
      setWorkspaceForm(defaultWorkspaceForm);
      setWorkspaceModalMode("create");
    } catch (error) {
      setWorkspaceFormError(error.message);
    }
  }


  async function handleCreateAgent() {
    try {
      if (agentModalMode === "global") {
        const name = agentForm.name.trim();
        if (!name) {
          setAgentFormError("请先填写智能体名称。");
          return;
        }

        const created = await api.createCoreAgent({
          user_id: auth?.user_id ?? null,
          name,
        });
        await handleRefreshAgentTeam();
        setGlobalAgentDetail(null);
        setAgentModalOpen(false);
        setAgentForm(defaultAgentForm);
        setAgentFormError("");
        setAgentModalMode("workspace");
        setViewState((prev) => ({
          ...prev,
          viewId: "agent_team_detail",
          selectedGlobalAgentId: created.id,
        }));
        return;
      }

      if (!currentWorkspace?.rawId) return;
      const agentId = Number(agentForm.agent_id);
      if (!agentId) {
        setAgentFormError("请先选择一个已有 Agent。");
        return;
      }
      await api.createAgent(currentWorkspace.rawId, { agent_id: agentId });
      const nextWorkspace = await reloadCurrentWorkspaceShell();
      setAgentModalOpen(false);
      setAgentForm(defaultAgentForm);
      setAgentFormError("");
      setAgentModalMode("workspace");
      setViewState((prev) => ({
        ...prev,
        viewId: "ws_chat_hub",
        chatHubAgentId: nextWorkspace?.agents.find((agent) => Number(agent.id) === agentId)?.id || null,
      }));
    } catch (error) {
      setAgentFormError(error.message);
    }
  }



  async function handleCreateKnowledge() {
    if (!currentWorkspace?.rawId) return;
    const name = knowledgeForm.name.trim();
    const port = knowledgeForm.port.trim();
    const apiKey = knowledgeForm.api_key.trim();
    const omnisearchPort = knowledgeForm.omnisearch_port.trim();
    if (!name || !port || !apiKey) {
      setKnowledgeFormError("请完整填写 Obsidian Vault 名称、Local REST 端口和 API Key。");
      return;
    }

    try {
      const created = await api.createKnowledge(currentWorkspace.rawId, {
        name,
        port: Number(port),
        api_key: apiKey,
        omnisearch_port: omnisearchPort ? Number(omnisearchPort) : null,
      });
      const nextWorkspace = await reloadCurrentWorkspaceShell();
      setKnowledgeModalOpen(false);
      setKnowledgeForm(defaultKnowledgeForm);
      setKnowledgeFormError("");
      setViewState((prev) => ({
        ...prev,
        viewId: "ws_kb",
        selectedKnowledgeId:
          String(created?.id || "") ||
          nextWorkspace?.knowledge.find((entry) => entry.title === name)?.id ||
          nextWorkspace?.knowledge[0]?.id ||
          null,
      }));
    } catch (error) {
      setKnowledgeFormError(error.message);
    }
  }



  function openWorkspace(workspace) {
    setViewState(buildWorkspaceViewState(workspace));
  }

  function navigateTo(nextView) {
    setViewState((prev) => ({ ...prev, viewId: nextView }));
  }

  function openHome() {
    if (!SHOW_HOME_VIEW) {
      openGlobalStats();
      return;
    }
    setViewState((prev) => ({ ...defaultViewState, viewId: "home", wsId: prev.wsId }));
  }

  function openGlobal() {
    setViewState((prev) => ({
      ...defaultViewState,
      viewId: "global",
      wsId: prev.wsId,
    }));
  }

  function resolveSelectedGlobalAgentId(team, currentSelectedId) {
    if (!team.length) return null;
    const current = currentSelectedId == null ? null : Number(currentSelectedId);
    if (current != null && team.some((agent) => Number(agent.id) === current)) {
      return currentSelectedId;
    }
    return team[0]?.id || null;
  }

  async function openAgentTeam() {
    const team = globalAgents.length ? globalAgents : await handleRefreshAgentTeam();
    setAgentConfigOpen(false);
    setViewState((prev) => {
      const nextSelectedGlobalAgentId = resolveSelectedGlobalAgentId(team, prev.selectedGlobalAgentId);
      return {
        ...defaultViewState,
        viewId: "agent_team",
        wsId: prev.wsId,
        selectedGlobalAgentId: nextSelectedGlobalAgentId,
      };
    });
  }

  async function openAgentTeamDetail(agentId) {
    setAgentConfigOpen(false);
    setViewState((prev) => ({
      ...defaultViewState,
      viewId: "agent_team_detail",
      wsId: prev.wsId,
      selectedGlobalAgentId: agentId,
    }));
  }

  function openAgentTeamConfig(initialTab = "basic") {
    const target = globalAgentDetail;
    if (!target) return;
    setAgentConfigInitialTab(initialTab);
    setAgentConfigForm({
      name: target.name || "",
      default_working_dir: target.default_working_dir || "",
      persona_name: target.persona_name || null,
      runtime_agent_name: target.runtime_agent_name || "",
      model_provider: target.model_provider || "",
      model_name: target.model_name || "",
      base_url: target.base_url || "",
    });
    setAgentConfigError("");
    setAgentConfigOpen(true);
  }

  function openAgentTeamCronHistory() {
    if (!agentTeamDetailCronContext) return;
    openCronHistory(
      agentTeamDetailCronContext.kind,
      agentTeamDetailCronContext.agentRefId,
      {
        agentSessionId: agentTeamDetailCronContext.agentSessionId,
        defaultJobId: agentTeamDetailCronContext.defaultJobId,
      }
    );
  }

  function openAgentTeamCronManager() {
    // agent 团队详情页的 cron 配置保持和 MOSS 一致：弹框配置，不做页面跳转。
  }

  function handleAgentConfigField(field, value) {
    setAgentConfigForm((prev) => ({ ...prev, [field]: value }));
    setAgentConfigError("");
  }

  async function handleSaveAgentBasic() {
    if (!globalAgentDetail) return;
    const trimmedName = agentConfigForm.name.trim();
    if (!trimmedName) {
      setAgentConfigError("Agent 名称不能为空。");
      return;
    }

    setAgentConfigSaving(true);
    setAgentConfigError("");
    try {
      await api.updateCoreAgent(globalAgentDetail.id, {
        name: trimmedName,
        default_working_dir: agentConfigForm.default_working_dir.trim() || null,
      });
      await handleRefreshAgentTeam();
      await loadGlobalAgentDetail(globalAgentDetail.id);
    } catch (error) {
      setAgentConfigError(error.message || "保存基本信息失败");
    } finally {
      setAgentConfigSaving(false);
    }
  }

  async function handleSaveAgentPersona() {
    if (!globalAgentDetail) return;

    setAgentConfigSaving(true);
    setAgentConfigError("");
    try {
      await api.updateCoreAgentPersona(globalAgentDetail.id, {
        persona_name: agentConfigForm.persona_name || null,
      });
      await handleRefreshAgentTeam();
      await loadGlobalAgentDetail(globalAgentDetail.id);
    } catch (error) {
      setAgentConfigError(error.message || "保存专家配置失败");
    } finally {
      setAgentConfigSaving(false);
    }
  }

  async function handleSaveAgentModel() {
    if (!globalAgentDetail) return;
    const runtimeAgentName = agentConfigForm.runtime_agent_name?.trim();
    const provider = agentConfigForm.model_provider?.trim();
    if (!runtimeAgentName) {
      setAgentConfigError("运行时 Agent 标识缺失，无法保存模型配置。");
      return;
    }
    if (!provider) {
      setAgentConfigError("请先选择模型提供商。");
      return;
    }

    setAgentConfigSaving(true);
    setAgentConfigError("");
    try {
      await updateAgentModel(
        runtimeAgentName,
        provider,
        agentConfigForm.model_name || "",
        agentConfigForm.base_url || "",
      );
      await loadGlobalAgentDetail(globalAgentDetail.id);
    } catch (error) {
      setAgentConfigError(error.message || "保存模型配置失败");
    } finally {
      setAgentConfigSaving(false);
    }
  }

  async function handleCreateAgentSubagent(payload) {
    if (!globalAgentDetail) return;
    setGlobalAgentSubagentsSaving(true);
    setAgentConfigError("");
    try {
      await api.createAgentSubagent(globalAgentDetail.id, payload);
      await Promise.all([
        handleRefreshAgentTeam(),
        loadGlobalAgentSubagents(globalAgentDetail.id),
        // 第一个 / 最后一个 binding 会联动改 session mode，所以详情和工作区壳都要一起刷新。
        loadGlobalAgentDetail(globalAgentDetail.id),
        reloadCurrentWorkspaceShell(),
      ]);
    } catch (error) {
      setAgentConfigError(error.message || "新增子Agent失败");
      throw error;
    } finally {
      setGlobalAgentSubagentsSaving(false);
    }
  }

  async function handleDeleteAgentSubagent(bindingId) {
    if (!globalAgentDetail) return;
    setGlobalAgentSubagentsSaving(true);
    setAgentConfigError("");
    try {
      await api.deleteAgentSubagent(globalAgentDetail.id, bindingId);
      await Promise.all([
        handleRefreshAgentTeam(),
        loadGlobalAgentSubagents(globalAgentDetail.id),
        loadGlobalAgentDetail(globalAgentDetail.id),
        reloadCurrentWorkspaceShell(),
      ]);
    } catch (error) {
      setAgentConfigError(error.message || "删除子Agent失败");
      throw error;
    } finally {
      setGlobalAgentSubagentsSaving(false);
    }
  }

  function openGlobalStats() {
    setViewState((prev) => ({
      ...defaultViewState,
      viewId: "global_stats",
      wsId: prev.wsId,
    }));
  }

  function openAIMarket() {
    setViewState((prev) => ({ ...defaultViewState, viewId: "ai_market" }));
  }

  function openBizExpert() {
    setViewState((prev) => ({ ...defaultViewState, viewId: "biz_expert" }));
  }

  const [clawSubNav, setClawSubNav] = useState("agent");
  const [openclawSubNav, setOpenclawSubNav] = useState("chat");
  const [hermesAgent, setHermesAgent] = useState(null);
  const [hermesJobs, setHermesJobs] = useState([]);
  const [hermesSkills, setHermesSkills] = useState([]);
  const [hermesToolsets, setHermesToolsets] = useState([]);

  const loadHermesData = useCallback(async () => {
    try {
      const [agentRes, jobsRes, skillsRes, toolsetsRes] = await Promise.all([
        hermesApi.getAgent().catch(() => null),
        hermesApi.getJobs().catch(() => []),
        hermesApi.getSkills().catch(() => []),
        hermesApi.getToolsets().catch(() => []),
      ]);
      setHermesAgent(agentRes);
      setHermesJobs(jobsRes);
      setHermesSkills(skillsRes);
      setHermesToolsets(toolsetsRes);
    } catch (err) {
      // ignore
    }
  }, []);

  // 检测外部智能体配置和连接状态
  useEffect(() => {
    let mounted = true;

    // OpenClaw 配置检测 + 连接检查（统一用 openclawApi.getConfig）
    Promise.all([openclawConfigApi.getConfigs(), openclawApi.getConfig()])
      .then(([configs, apiConfig]) => {
        if (!mounted) return;
        const configured = isOpenClawConfigured(configs);
        setExternalAgents((prev) => ({
          ...prev,
          openclaw: { ...prev.openclaw, configured },
        }));
        if (configured) {
          return openclawGateway
            .connect(apiConfig.proxyUrl || apiConfig.gatewayUrl)
            .catch((err) => {
              if (!mounted) return;
              console.error("[OpenClaw] 自动连接失败:", err.message);
            });
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error("[OpenClaw] 配置获取失败:", err.message);
          setExternalAgents((prev) => ({
            ...prev,
            openclaw: { ...prev.openclaw, configured: false, connected: false },
          }));
        }
      });

    // Hermes 配置检测 + 连接检查
    hermesApi
      .getConfigs()
      .then((configs) => {
        if (!mounted) return;
        const configured = isHermesConfigured(configs);
        setExternalAgents((prev) => ({
          ...prev,
          hermes: { ...prev.hermes, configured },
        }));
        // 无论是否配置，都尝试检测连接状态
        return hermesApi
          .getAgent()
          .then((agent) => {
            if (!mounted) return;
            setExternalAgents((prev) => ({
              ...prev,
              hermes: { ...prev.hermes, connected: agent?.status === "online", agent },
            }));
          })
          .catch(() => {
            if (!mounted) return;
            setExternalAgents((prev) => ({
              ...prev,
              hermes: { ...prev.hermes, connected: false, agent: null },
            }));
          });
      })
      .catch(() => {
        if (mounted) {
          setExternalAgents((prev) => ({
            ...prev,
            hermes: { ...prev.hermes, configured: false, connected: false, agent: null },
          }));
        }
      });

    // 监听 OpenClaw 连接状态
    const unsubscribe = openclawGateway.subscribeState((state) => {
      if (!mounted) return;
      setExternalAgents((prev) => ({
        ...prev,
        openclaw: { ...prev.openclaw, connected: state === "connected" },
      }));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hermes 连接状态同步
  useEffect(() => {
    setExternalAgents((prev) => ({
      ...prev,
      hermes: { ...prev.hermes, connected: hermesAgent?.status === "online", agent: hermesAgent },
    }));
  }, [hermesAgent]);

  useEffect(() => {
    if (viewState.viewId === "hermes") {
      loadHermesData();
    }
  }, [viewState.viewId, loadHermesData]);

  function openHermes() {
    setViewState((prev) => ({ ...defaultViewState, viewId: "hermes" }));
    setClawSubNav("agent");
  }

  function openExternalAgentConfig(agentType) {
    setExternalAgentConfigType(agentType);
  }

  function closeExternalAgentConfig() {
    setExternalAgentConfigType(null);
  }

  function openScene() {
    setViewState((prev) => ({ ...defaultViewState, viewId: "scene" }));
  }

  function openOpenClaw() {
    setViewState((prev) => ({ ...defaultViewState, viewId: "openclaw" }));
    setOpenclawSubNav("overview");
  }

  function openOffice() {
    navigateTo("ws_office");
  }

  function openChatHub(agentId = null) {
    if (agentId != null) {
      const agent = findAgentById(currentWorkspace?.agents, agentId);
      const sessionId = getAgentWorkspaceSessionId(agent);
      if (sessionId != null) {
        workspaceMessages.setSelectedAgentSessionId(String(sessionId));
      }
    }
    setViewState((prev) => ({
      ...prev,
      viewId: "ws_chat_hub",
      chatHubAgentId: agentId,
    }));
  }

  async function handleCheckExternalAgent(type) {
    if (type === "openclaw") {
      try {
        const config = await openclawApi.getConfig();
        if (config.proxyUrl || config.gatewayUrl) {
          await openclawGateway.connect(config.proxyUrl || config.gatewayUrl);
        }
        // connected 状态由 subscribeState 实时同步，这里只标记 configured
        setExternalAgents((prev) => ({
          ...prev,
          openclaw: { ...prev.openclaw, configured: true },
        }));
        if (openclawGateway.state === "connected") {
          setViewState((prev) => ({
            ...prev,
            viewId: "ws_chat_hub",
            chatHubAgentId: "__openclaw__",
          }));
        }
      } catch (err) {
        console.error("[OpenClaw] 连接检查失败:", err.message);
      }
    }
    if (type === "hermes") {
      try {
        const agent = await hermesApi.getAgent();
        const isOnline = agent?.status === "online";
        setExternalAgents((prev) => ({
          ...prev,
          hermes: { ...prev.hermes, connected: isOnline, agent },
        }));
        if (isOnline) {
          setViewState((prev) => ({
            ...prev,
            viewId: "ws_chat_hub",
            chatHubAgentId: "__hermes__",
          }));
        }
      } catch (err) {
        console.error("[Hermes] 连接检查失败:", err.message);
        setExternalAgents((prev) => ({
          ...prev,
          hermes: { ...prev.hermes, connected: false, agent: null },
        }));
      }
    }
  }

  // 实时同步 gateway 状态到 externalAgents.openclaw.connected
  useEffect(() => {
    const unsub = openclawGateway.subscribeState((state) => {
      setExternalAgents((prev) => ({
        ...prev,
        openclaw: { ...prev.openclaw, connected: state === "connected" },
      }));
    });
    return unsub;
  }, []);

  function openAgent(agentId) {
    setViewState((prev) => ({
      ...prev,
      viewId: "ws_chat_hub",
      chatHubAgentId: agentId,
    }));
  }

  function openKnowledge(knowledgeId) {
    setViewState((prev) => ({ ...prev, viewId: "ws_kb", selectedKnowledgeId: knowledgeId }));
  }

  function openTasks(agentSessionId = null) {
    setWorkspaceTaskFocusAgentSessionId(agentSessionId != null ? String(agentSessionId) : null);
    setViewState((prev) => ({ ...prev, viewId: "ws_tasks" }));
  }

  function normalizeCronScopeValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? String(value) : parsed;
  }

  async function openWorkspaceTaskBoard() {
    openTasks();
    if (!currentWorkspace?.id) {
      setWorkspaceTaskBoardPendingAction(null);
      return;
    }

    try {
      const jobs = await api.listCronJobs({ workspaceId: currentWorkspace.id });
      const workspaceJobs = (Array.isArray(jobs) ? jobs : [])
        .sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
          const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
          return bTime - aTime;
        });

      if (workspaceJobs.length === 0) {
        setWorkspaceTaskBoardPendingAction({ type: "create" });
        return;
      }

      const selectedJob = workspaceJobs[0];
      setWorkspaceTaskBoardPendingAction({
        type: "history",
        agentSessionId: selectedJob.agent_session_id,
        jobId: selectedJob.id,
      });
    } catch {
      setWorkspaceTaskBoardPendingAction(null);
    }
  }

  function openWorkspaceAgentPersona(agentId = null) {
    if (agentId != null) {
      setWorkspaceAgentDetailAgentId(String(agentId));
    }
    setWorkspaceAgentPersonaOpen(true);
  }

  function closeWorkspaceAgentPersona() {
    setWorkspaceAgentPersonaOpen(false);
  }

  const workspaceAgentDetail = useMemo(() => {
    if (!currentWorkspace?.agents?.length || workspaceAgentDetailAgentId == null) return null;
    return currentWorkspace.agents.find((agent) => String(agent.id) === String(workspaceAgentDetailAgentId)) || null;
  }, [currentWorkspace, workspaceAgentDetailAgentId]);

  async function saveWorkspaceAgentPersona(personaName) {
    if (!currentWorkspace?.rawId || !workspaceAgentDetail) return;
    await api.updateAgent(currentWorkspace.rawId, workspaceAgentDetail.id, {
      persona_name: personaName || null,
    });
    await reloadCurrentWorkspaceShell();
    setWorkspaceAgentDetailAgentId(String(workspaceAgentDetail.id));
  }

  async function saveWorkspaceAgentSubagentMode(nextMode) {
    if (!workspaceAgentDetail) return;
    await updateSessionSubagentMode({
      sessionId: getAgentWorkspaceSessionId(workspaceAgentDetail),
      nextMode,
      scope: "workspace",
    });
    setWorkspaceAgentDetailAgentId(String(workspaceAgentDetail.id));
  }

  async function updateSessionSubagentMode({ sessionId, nextMode, scope }) {
    if (!sessionId) return;
    setSubagentModeSaving(true);
    try {
      await api.updateAgentSession(sessionId, { subagent_mode: nextMode });
      // mode 属于具体会话：default session 刷全局详情，workspace session 刷工作区壳。
      if (scope === "default") {
        if (globalAgentDetail?.id) {
          await loadGlobalAgentDetail(globalAgentDetail.id);
        }
      } else if (scope === "workspace") {
        await reloadCurrentWorkspaceShell();
      }
    } catch (error) {
      setConfirmState({
        open: true,
        title: "切换子Agent工作模式失败",
        message: error.message || "保存会话模式失败。",
        confirmLabel: "知道了",
        confirmTone: "primary",
        error: "",
        action: async () => {},
      });
    } finally {
      setSubagentModeSaving(false);
    }
  }

  useEffect(() => {
    if (!workspaceTaskBoardPendingAction) return;
    if (workspaceTaskBoardPendingAction.type === "create") {
      setWorkspaceCronCreateSignal((prev) => prev + 1);
    } else if (workspaceTaskBoardPendingAction.type === "history") {
      openCronHistory("agent_session", null, {
        agentSessionId: workspaceTaskBoardPendingAction.agentSessionId,
        defaultJobId: workspaceTaskBoardPendingAction.jobId,
        sourceViewId: "ws_tasks",
      });
    }
    setWorkspaceTaskBoardPendingAction(null);
  }, [workspaceTaskBoardPendingAction]);

  useEffect(() => {
    setWorkspaceAgentDetailAgentId(null);
    setWorkspaceTaskFocusAgentSessionId(null);
    setWorkspaceAgentPersonaOpen(false);
  }, [currentWorkspace?.id]);

  useEffect(() => {
    if (viewState.viewId !== "ws_tasks") return;
    if (!currentWorkspace?.rawId) return;
    reloadCurrentWorkspaceShell().catch((error) => {
      console.error("刷新任务页工作空间失败:", error);
    });
  }, [viewState.viewId, currentWorkspace?.rawId]);

  function openCronHistory(kind, agentRefId, { agentSessionId = null, defaultJobId, sourceViewId = viewState.viewId } = {}) {
    let agentName = "";
    let workspaceId = null;
    let sourceAgentId = null;
    let sourceGlobalAgentId = null;

    if (kind === "moss") {
      agentName = "MOSS";
    } else if (kind === "agent_session" && agentSessionId != null) {
      const meta = agentSessionIndex.get(Number(agentSessionId));
      agentName = meta?.agentName || "Agent";
      workspaceId = meta?.workspaceId ?? null;
      sourceAgentId = meta?.agentId ?? null;
      if (viewState.viewId === "agent_team_detail") {
        sourceGlobalAgentId = globalAgentDetail?.id ?? null;
      }
    }

    setCronHistoryContext({
      kind,
      agentRefId,
      agentSessionId,
      workspaceId,
      agentName,
      defaultJobId,
      sourceViewId,
      sourceAgentId,
      sourceGlobalAgentId,
    });
    setViewState((prev) => ({ ...prev, viewId: "cron_history" }));
  }

  const refreshCronHistoryEntry = useCallback(() => {
    if (!auth) return;
    let kind;
    let agentSessionId = null;
    if (viewState.viewId === "global") {
      kind = "moss";
    } else if (viewState.viewId === "agent_team_detail" && globalAgentDefaultSessionId) {
      kind = "agent_session";
      agentSessionId = globalAgentDefaultSessionId;
    } else if (viewState.viewId === "ws_agents" && viewState.selectedAgentId) {
      kind = "agent_session";
      agentSessionId = getAgentWorkspaceSessionId(selectedAgent);
    } else if (viewState.viewId === "ws_chat_hub" && viewState.chatHubAgentId && viewState.chatHubAgentId !== "__openclaw__" && viewState.chatHubAgentId !== "__hermes__") {
      kind = "agent_session";
      const chatHubAgent = findAgentById(currentWorkspace?.agents, viewState.chatHubAgentId);
      agentSessionId = getAgentWorkspaceSessionId(chatHubAgent);
    } else {
      return;
    }
    if (!kind || (kind === "agent_session" && agentSessionId == null)) return;
    const scopeIdentity = kind === "agent_session" ? agentSessionId : kind;
    const key = `${kind}:${scopeIdentity ?? "null"}`;
    api.getCronHistoryList({ kind, agentSessionId })
      .then((data) => {
        setCronHistoryEntryMap((prev) => ({
          ...prev,
          [key]: (data.jobs?.length || 0) > 0,
        }));
      })
      .catch(() => {
        setCronHistoryEntryMap((prev) => ({ ...prev, [key]: false }));
      });
  }, [
    auth,
    viewState.viewId,
    viewState.selectedAgentId,
    viewState.chatHubAgentId,
    getAgentWorkspaceSessionId(selectedAgent),
    currentWorkspace?.agents,
    globalAgentDetail?.id,
    globalAgentDefaultSessionId,
  ]);

  // Prefetch cron existence for current agent scope to drive Header entry visibility
  useEffect(() => {
    refreshCronHistoryEntry();
  }, [refreshCronHistoryEntry]);

  function getHeaderTitle() {
    if (viewState.viewId === "home") return "Mini8 生态";
    if (viewState.viewId === "global") return "MOSS";
    if (viewState.viewId === "agent_team") return "Agent团队";
    if (viewState.viewId === "agent_team_detail") return globalAgentDetail?.name || selectedGlobalAgent?.name || "Agent";
    if (viewState.viewId === "ai_market") return "资源包";
    if (viewState.viewId === "ws_office") return "工作室";
    if (viewState.viewId === "ws_agents") return selectedAgent?.name || "Agent团队";
    if (viewState.viewId === "global_stats") return "看板";
    if (viewState.viewId === "ws_chat_hub") {
      return "指令下达";
    }
    if (viewState.viewId === "ws_tasks") return "任务列表";
    if (viewState.viewId === "ws_kb") return currentKnowledge?.title || "知识库列表";
    if (viewState.viewId === "biz_expert") return "专家人格";
    if (viewState.viewId === "hermes") return "Hermes";
    if (viewState.viewId === "openclaw") return "OpenClaw";
    if (viewState.viewId === "scene") return "场景案例";
    if (viewState.viewId === "cron_history") return `${getHeaderTitleForCronHistory()} · 定时任务历史`;
    return "Mini8";
  }

  function getHeaderTitleForCronHistory() {
    if (!cronHistoryContext) return "";
    return cronHistoryContext.agentName || "";
  }

  function getHeaderIcon() {
    const size = 20;
    const strokeWidth = 2;
    if (viewState.viewId === "global") return <Brain size={size} strokeWidth={strokeWidth} className="header-moss-icon" />;
    if (viewState.viewId === "ws_chat_hub") return <MessageSquare size={16} strokeWidth={2.1} className="header-moss-icon" color="#10b981" fill="none" />;
    if (viewState.viewId === "agent_team" || viewState.viewId === "agent_team_detail") return <Users size={size} strokeWidth={strokeWidth} className="header-biz-expert-icon" />;
    if (viewState.viewId === "global_stats") return <BarChart3 size={size} strokeWidth={strokeWidth} className="header-stats-icon" />;
    if (viewState.viewId === "ws_office") return <Building2 size={size} strokeWidth={strokeWidth} className="header-office-icon" />;
    if (viewState.viewId === "ws_tasks") return <ListTodo size={size} strokeWidth={strokeWidth} className="header-office-icon" />;
    if (viewState.viewId === "hermes") return <Bot size={size} strokeWidth={strokeWidth} className="header-claw-icon" />;
    if (viewState.viewId === "openclaw") return <Zap size={size} strokeWidth={strokeWidth} className="header-claw-icon" />;
    if (viewState.viewId === "ai_market") return <Store size={size} strokeWidth={strokeWidth} className="header-market-icon" />;
    if (viewState.viewId === "scene") return <Building2 size={size} strokeWidth={strokeWidth} className="header-scene-icon" />;
    if (viewState.viewId === "biz_expert") return <Users size={size} strokeWidth={strokeWidth} className="header-biz-expert-icon" />;
    return <Brain size={size} strokeWidth={strokeWidth} className="header-moss-icon" />;
  }

  async function reloadCurrentWorkspaceShell() {
    if (!currentWorkspace?.rawId) return null;
    const nextWorkspace = await buildWorkspaceShellFromApi({
      id: currentWorkspace.rawId,
      name: currentWorkspace.name,
      goal: currentWorkspace.goal,
      working_dir: currentWorkspace.workingDir || null,
    });
    setWorkspaces((prev) =>
      prev.map((workspace) => (workspace.id === nextWorkspace.id ? nextWorkspace : workspace)),
    );
    return nextWorkspace;
  }






  function openDownloadKnowledgeSkillConfirm() {
    if (!currentKnowledge) return;
    setConfirmState({
      open: true,
      title: "让 Agent 使用知识库",
      message: `将下载知识库「${currentKnowledge.title}」对应的 skill。你可以交给自己的 Agent 使用，让它按绑定配置访问、搜索和维护该知识库。`,
      confirmLabel: "下载知识库 Skill",
      confirmTone: "primary",
      error: "",
      action: async () => {
        window.location.href = api.getKnowledgeSkillUrl(currentKnowledge.id);
      },
    });
  }


  function openDeleteAgentConfirm(agentId, agentName) {
    if (viewState.viewId === "agent_team" || viewState.viewId === "agent_team_detail") {
      setConfirmState({
        open: true,
        title: "删除 Agent",
        message: `确认删除 Agent「${agentName}」吗？它的默认会话、运行目录、工作空间绑定，以及与其他 Agent 的子Agent绑定关系都会一并清除。`,
        confirmLabel: "确认删除",
        error: "",
        action: async () => {
          await api.deleteCoreAgent(agentId);
          const team = await handleRefreshAgentTeam();
          setGlobalAgentDetail(null);
          setAgentConfigOpen(false);
          setViewState((prev) => ({
            ...prev,
            viewId: prev.viewId === "agent_team_detail" ? "agent_team" : prev.viewId,
            selectedGlobalAgentId: resolveSelectedGlobalAgentId(team, prev.selectedGlobalAgentId),
          }));
        },
      });
      return;
    }

    if (!currentWorkspace?.rawId) return;
    setConfirmState({
      open: true,
      title: "删除 Agent",
      message: `确认删除 Agent「${agentName}」吗？该 agent 的关联会话和绑定关系会一并清除。`,
      confirmLabel: "确认删除",
      error: "",
      action: async () => {
        await api.deleteAgent(currentWorkspace.rawId, agentId);
        const nextWorkspace = await reloadCurrentWorkspaceShell();
        setViewState((prev) => ({
          ...prev,
          ...buildWorkspaceViewState(nextWorkspace, {
            viewId: "ws_office",
            selectedAgentId: null,
          }),
        }));
      },
    });
  }

  async function openKnowledgeFolder(path) {
    if (!currentKnowledge) return;
    setKnowledgeBrowser((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const tree = await api.getKnowledgeTree(currentKnowledge.id, path);
      setKnowledgeBrowser((prev) => ({
        ...prev,
        loading: false,
        currentPath: tree.current_path || "",
        entries: tree.entries || [],
        selectedFilePath: "",
        selectedFile: null,
      }));
    } catch (error) {
      setKnowledgeBrowser((prev) => ({ ...prev, loading: false, error: error.message }));
    }
  }

  async function openKnowledgeEntry(path) {
    if (!currentKnowledge) return;
    setKnowledgeBrowser((prev) => ({ ...prev, loading: true, error: "", selectedFilePath: path }));
    try {
      const file = await api.getKnowledgeFile(currentKnowledge.id, path);
      setKnowledgeBrowser((prev) => ({
        ...prev,
        loading: false,
        selectedFilePath: path,
        selectedFile: file,
      }));
    } catch (error) {
      setKnowledgeBrowser((prev) => ({ ...prev, loading: false, error: error.message }));
    }
  }

  function openLocalObsidian() {
    if (!currentKnowledge?.vaultName) return;
    window.location.href = `obsidian://open?vault=${encodeURIComponent(currentKnowledge.vaultName)}`;
  }

  function openUnbindKnowledgeConfirm() {
    if (!currentWorkspace || !currentKnowledge) return;
    setConfirmState({
      open: true,
      title: "解除知识库绑定",
      message: `确认解除知识库「${currentKnowledge.title}」吗？`,
      confirmLabel: "确认解除绑定",
      error: "",
      action: async () => {
        await api.deleteKnowledge(currentWorkspace.id, currentKnowledge.id);
        const nextWorkspace = await reloadCurrentWorkspaceShell();
        setViewState((prev) => ({
          ...prev,
          selectedKnowledgeId: nextWorkspace?.knowledge[0]?.id || null,
        }));
      },
    });
  }

  function openDeleteWorkspaceConfirm() {
    if (!currentWorkspace?.rawId) return;
    setConfirmState({
      open: true,
      title: "删除工作空间",
      message: `确认删除工作空间「${currentWorkspace.name}」吗？该空间下的内容和知识库绑定都会被清除。`,
      confirmLabel: "确认删除空间",
      error: "",
      action: async () => {
        await api.deleteWorkspace(currentWorkspace.rawId);
        setWorkspaces((prev) => {
          const nextWorkspaces = prev.filter((workspace) => workspace.id !== currentWorkspace.id);
          const fallbackWorkspace = nextWorkspaces[0] || null;
          setViewState(
            fallbackWorkspace
              ? {
                  ...defaultViewState,
                  viewId: "ws_chat_hub",
                  wsId: fallbackWorkspace.id,
                  selectedAgentId: fallbackWorkspace.agents[0]?.id || null,
                  selectedKnowledgeId: fallbackWorkspace.knowledge[0]?.id || null,
                }
              : defaultViewState,
          );
          return nextWorkspaces;
        });
      },
    });
  }

  function handleDeleteSession() {
    // 外部智能体在 ChatHubPage 内部管理会话，不走这里；全局统计页也不走
    if (viewState.viewId === "global_stats") return;
    if (viewState.viewId === "ws_chat_hub" && (viewState.chatHubAgentId === "__openclaw__" || viewState.chatHubAgentId === "__hermes__")) {
      return;
    }

    const currentChat =
      viewState.viewId === "global"
        ? mossChat
        : viewState.viewId === "ws_agents" ||
          (viewState.viewId === "ws_chat_hub" && viewState.chatHubAgentId)
        ? workspaceAgentChat
        : null;

    if (!currentChat?.threadId) return;

    setConfirmState({
      open: true,
      title: "清空当前对话",
      message: "确认清空当前对话吗？对话中的所有消息记录将被清除，且无法恢复。",
      confirmLabel: "确认清空",
      error: "",
      action: async () => {
        await currentChat.deleteCurrentSession();
      },
    });
  }

  async function confirmAction() {
    if (!confirmState.action) return;
    try {
      await confirmState.action();
      setConfirmState(emptyConfirmState);
    } catch (error) {
      setConfirmState((prev) => ({ ...prev, error: error.message || "操作失败" }));
    }
  }

  function openExternalLinkConfirm(targetKey) {
    const target = externalLinkTargets[targetKey];
    if (!target) return;
    setConfirmState({
      open: true,
      title: target.title,
      message: target.message,
      confirmLabel: target.confirmLabel,
      confirmTone: "primary",
      error: "",
      action: async () => {
        if (!target.url) {
          throw new Error("链接待配置。");
        }
        window.open(target.url, "_blank", "noopener,noreferrer");
      },
    });
  }



  async function submitConsoleDraft(attachments = [], overrideText = null) {
    const message = (overrideText ?? consoleDraft).trim();
    if (!message || chatTargetConfig.disabled) return;
    const sent = await activeRuntimeChat.sendMessage({
      text: message,
      authorName: displayName,
      attachments,
    });
    if (!sent) return;
    setConsoleDraft("");
  }

  function renderMainView() {
    const noWorkspaceLoading = ["ai_market", "scene", "hermes", "openclaw", "agent_team", "agent_team_detail"];
    if (loading && !noWorkspaceLoading.includes(viewState.viewId)) {
      return <div className="view-empty">正在加载工作空间数据...</div>;
    }

    if (SHOW_HOME_VIEW && viewState.viewId === "home") {
      return (
        <HomeView
          onEnterMoss={openGlobal}
          onOpenUserPanel={() => setUserPanelOpen(true)}
          onOpenWorkspace={() => {
            if (workspaces[0]) openWorkspace(workspaces[0]);
            else setWorkspaceModalOpen(true);
          }}
          onOpenAgents={() => {
            if (!workspaces[0]) { setWorkspaceModalOpen(true); return; }
            const ws = workspaces[0];
            setViewState(buildWorkspaceViewState(ws, {
              viewId: "ws_chat_hub",
              chatHubAgentId: ws.agents[0]?.id || null,
            }));
          }}
          onOpenKnowledge={() => {
            if (!workspaces[0]) { setWorkspaceModalOpen(true); return; }
            const ws = workspaces[0];
            setViewState(buildWorkspaceViewState(ws, { viewId: "ws_kb" }));
          }}
          onOpenAIMarket={openAIMarket}
          onOpenBizExpert={openBizExpert}
          onOpenJoy={() => openExternalLinkConfirm("joyCommunity")}
          onOpenPlay={() => openExternalLinkConfirm("agentPlayground")}
        />
      );
    }

    if (viewState.viewId === "ai_market") {
      return <AIMarketView />;
    }

    if (viewState.viewId === "biz_expert") {
      return <PersonaCatalogPage personas={personaCatalog} />;
    }

    if (viewState.viewId === "hermes") {
      return (
        <HermesPage
          subNav={clawSubNav}
          agent={hermesAgent}
          jobs={hermesJobs}
          skills={hermesSkills}
          toolsets={hermesToolsets}
          loadData={loadHermesData}
        />
      );
    }

    if (viewState.viewId === "scene") {
      return <ScenePage />;
    }

    if (viewState.viewId === "openclaw") {
      return <OpenClawPage subNav={openclawSubNav} />;
    }

    if (viewState.viewId === "global_stats") {
      return (
        <GlobalStatsPage
          workspaceCount={globalStats.workspaceCount}
          knowledgeCount={globalStats.knowledgeCount}
          agentCount={globalStats.agentCount}
          hermesConnected={globalStats.hermesConnected}
          openclawConnected={globalStats.openclawConnected}
          onNavigateToHistory={({ kind, agentSessionId, jobId }) => {
            if (kind === "moss") {
              openCronHistory(kind, null, { agentSessionId, defaultJobId: jobId });
            } else if (kind === "agent_session" && agentSessionId != null) {
              const meta = agentSessionIndex.get(Number(agentSessionId));
              const wsId = meta?.workspaceId;
              if (wsId != null) {
                const url = new URL(window.location.href);
                url.searchParams.set("manage", "workspace");
                url.searchParams.set("wsId", String(wsId));
                url.searchParams.set("view", "cron_history");
                url.searchParams.set("agentSessionId", String(agentSessionId));
                url.searchParams.set("defaultJobId", String(jobId));
                if (meta?.scopeType === "agent" && meta.agentId != null) {
                  url.searchParams.set("agentId", String(meta.agentId));
                } else {
                  url.searchParams.delete("agentId");
                }
                window.open(url.toString(), "_blank");
              }
            }
          }}
        />
      );
    }

    if (viewState.viewId === "agent_team") {
      if (agentTeamLoading && globalAgents.length === 0) {
        return <div className="view-empty">正在加载 Agent 团队...</div>;
      }
      if (agentTeamError && globalAgents.length === 0) {
        return <div className="view-empty">{agentTeamError}</div>;
      }
      return (
        <AgentTeamPage
          agents={globalAgents}
          externalAgents={externalAgents}
          onOpenAgent={openAgentTeamDetail}
          onOpenCreateAgent={openCreateGlobalAgentModal}
          onDeleteAgent={openDeleteAgentConfirm}
          onOpenHermes={() => openExternalAgentConfig("hermes")}
          onOpenOpenClaw={() => openExternalAgentConfig("openclaw")}
        />
      );
    }

    if (viewState.viewId === "agent_team_detail") {
      if (agentTeamLoading && !globalAgentDetail) {
        return <div className="view-empty">正在加载 Agent 详情...</div>;
      }
      if (agentTeamError && !globalAgentDetail) {
        return <div className="view-empty">{agentTeamError}</div>;
      }
      return (
        <AgentTeamDetailPage
          agent={globalAgentDetail}
          subagents={globalAgentSubagents}
          subagentsLoading={globalAgentSubagentsLoading}
          messages={activeRuntimeChat.messages}
          isStreaming={activeRuntimeChat.status === "streaming"}
          consoleDraft={consoleDraft}
          onChangeDraft={setConsoleDraft}
          onSubmit={submitConsoleDraft}
          disabled={chatTargetConfig.disabled}
          hasMoreHistory={activeRuntimeChat.hasMoreHistory}
          isLoadingMore={activeRuntimeChat.isLoadingMore}
          onLoadMore={activeRuntimeChat.loadMoreMessages}
          onRollback={activeRuntimeChat.rollbackToMessage}
          canRollback={!activeRuntimeChat.isRollingBack && activeRuntimeChat.status !== "streaming"}
          queuedMessages={activeRuntimeChat.queuedMessages}
          onRemoveQueued={activeRuntimeChat.removeQueuedMessage}
          rollbackConfirm={activeRuntimeChat.rollbackConfirm}
          confirmRollback={activeRuntimeChat.confirmRollback}
          cancelRollback={activeRuntimeChat.cancelRollback}
          isMultimodal={activeRuntimeChat.isMultimodal}
          stopStreaming={activeRuntimeChat.stopStreaming}
          onBack={openAgentTeam}
          onOpenConfig={() => openAgentTeamConfig("basic")}
          onManageSubagents={() => openAgentTeamConfig("subagents")}
          onOpenSubagent={openAgentTeamDetail}
          onClearSession={activeRuntimeChat.deleteCurrentSession}
          onOpenCronHistory={openAgentTeamCronHistory}
          showCronHistoryEntry={Boolean(cronHistoryEntryMap[`agent_session:${globalAgentDefaultSessionId ?? "null"}`])}
          onCronMutated={refreshCronHistoryEntry}
          onChangeSubagentMode={(nextMode) =>
            updateSessionSubagentMode({
              sessionId: globalAgentDefaultSessionId,
              nextMode,
              scope: "default",
            })
          }
          subagentModeSaving={subagentModeSaving}
          isInCronHistory={viewState.viewId === "cron_history" && cronHistoryContext?.agentSessionId === globalAgentDefaultSessionId}
          primaryKey={auth?.user_id ?? null}
        />
      );
    }

    if (viewState.viewId === "ws_office") {
      const officeActions = {
        onOpenKnowledge: openKnowledge,
        onOpenChatHub: openChatHub,
        onOpenAgent: openAgent,
        onOpenOffice: openOffice,
        onCreateKnowledge: () => setKnowledgeModalOpen(true),
        onCreateAgent: openCreateWorkspaceAgentModal,
        onOpenMossChatInNewTab: () => {
          window.open("/?view=global", "_blank");
        },
        onOpenWorkspaceSettings: () => setWorkspaceSettingsModalOpen(true),
        onOpenWorkspaceEdit: () => {
          if (!currentWorkspace) return;
          setWorkspaceModalMode("edit");
          setWorkspaceForm({
            name: currentWorkspace.name || "",
            goal: currentWorkspace.goal === "待补充工作总目标" ? "" : currentWorkspace.goal || "",
            working_dir: currentWorkspace.workingDir || "",
          });
          setWorkspaceFormError("");
          setWorkspaceModalOpen(true);
        },
      };
      const statuses = {
        workspaceAgentStatuses: workspaceAgentChat.statusesByAgentId || {},
        workspaceAgentCompletions: workspaceAgentChat.completionByAgentId || {},
        workspaceAgentSeenCompletions: seenWorkspaceAgentCompletionById,
      };
      const focusTarget =
        viewState.viewId === "ws_chat_hub"
          ? viewState.chatHubAgentId
          : viewState.viewId === "ws_agents"
          ? viewState.selectedAgentId
          : viewState.viewId === "ws_office"
          ? viewState.selectedAgentId
          : null;
      return (
        <OfficePage
          workspace={currentWorkspace}
          currentUserName={displayName}
          actions={{
            ...officeActions,
            onOpenTasks: openTasks,
            onOpenChat: openChatHub,
            onOpenPersona: openWorkspaceAgentPersona,
            ...getOfficeSelectionState({ officeFocusTarget: focusTarget }),
          }}
          agentStatuses={statuses}
        />
      );
    }

    if (viewState.viewId === "ws_agents") {
      return (
        <AgentPage
          agentName={selectedAgent?.name}
          agentId={selectedAgent?.id}
          agentSessionId={getAgentWorkspaceSessionId(selectedAgent)}
          subagentMode={getAgentWorkspaceSessionSubagentMode(selectedAgent)}
          hasSubagentRoster={getAgentWorkspaceSessionSubagentMode(selectedAgent) !== null}
          messages={activeRuntimeChat.messages}
          isStreaming={activeRuntimeChat.status === "streaming"}
          consoleDraft={consoleDraft}
          onChangeDraft={setConsoleDraft}
          onSubmit={submitConsoleDraft}
          disabled={chatTargetConfig.disabled}
          hasMoreHistory={activeRuntimeChat.hasMoreHistory}
          isLoadingMore={activeRuntimeChat.isLoadingMore}
          onLoadMore={activeRuntimeChat.loadMoreMessages}
          onRollback={activeRuntimeChat.rollbackToMessage}
          canRollback={!activeRuntimeChat.isRollingBack && activeRuntimeChat.status !== "streaming"}
          queuedMessages={activeRuntimeChat.queuedMessages}
          onChangeSubagentMode={(nextMode) =>
            updateSessionSubagentMode({
              sessionId: getAgentWorkspaceSessionId(selectedAgent),
              nextMode,
              scope: "workspace",
            })
          }
          subagentModeSaving={subagentModeSaving}
          dropUploadContext={{
            agentSessionId: getAgentWorkspaceSessionId(selectedAgent),
            primaryKey: auth?.user_id ?? null,
          }}
        />
      );
    }

    if (viewState.viewId === "ws_chat_hub") {
      return (
        <ChatHubPage
          workspace={currentWorkspace}
          chatHubAgentId={viewState.chatHubAgentId}
          externalAgents={externalAgents}
          workspaceMessages={workspaceMessages.messages}
          workspaceMessageLoading={workspaceMessages.loading}
          workspaceMessageSending={workspaceMessages.sending}
          workspaceMessageError={workspaceMessages.error}
          workspaceMessageAgents={workspaceMessages.agentOptions}
          selectedWorkspaceMessageAgentSessionId={workspaceMessages.selectedAgentSessionId}
          onChangeWorkspaceMessageAgentSessionId={workspaceMessages.setSelectedAgentSessionId}
          onSubmitWorkspaceMessage={workspaceMessages.sendHumanMessage}
          onRefreshWorkspaceMessages={workspaceMessages.refresh}
          onSelectAgent={(agentId) =>
            setViewState((prev) => ({ ...prev, chatHubAgentId: agentId }))
          }
          onCheckExternalAgent={handleCheckExternalAgent}
          onOpenCreateAgent={openCreateWorkspaceAgentModal}
          onDeleteAgent={openDeleteAgentConfirm}
          workspaceAgentChatBadgeById={workspaceAgentChatBadgeById}
          messages={activeRuntimeChat.messages}
          isStreaming={activeRuntimeChat.status === "streaming"}
          consoleDraft={consoleDraft}
          onChangeDraft={setConsoleDraft}
          onSubmit={submitConsoleDraft}
          disabled={chatTargetConfig.disabled}
          hasMoreHistory={activeRuntimeChat.hasMoreHistory}
          isLoadingMore={activeRuntimeChat.isLoadingMore}
          onLoadMore={activeRuntimeChat.loadMoreMessages}
          onRollback={activeRuntimeChat.rollbackToMessage}
          canRollback={!activeRuntimeChat.isRollingBack && activeRuntimeChat.status !== "streaming"}
          queuedMessages={activeRuntimeChat.queuedMessages}
          onRemoveQueued={activeRuntimeChat.removeQueuedMessage}
          rollbackConfirm={activeRuntimeChat.rollbackConfirm}
          confirmRollback={activeRuntimeChat.confirmRollback}
          cancelRollback={activeRuntimeChat.cancelRollback}
          isMultimodal={activeRuntimeChat.isMultimodal}
          stopStreaming={activeRuntimeChat.stopStreaming}
          dropUploadContext={
            viewState.chatHubAgentId
              ? {
                  agentSessionId: (() => {
                    return getAgentWorkspaceSessionId(findAgentById(currentWorkspace.agents, viewState.chatHubAgentId));
                  })(),
                  primaryKey: auth?.user_id ?? null,
                }
              : null
          }
        />
      );
    }

    if (viewState.viewId === "ws_kb") {
      return (
        <KnowledgePage
          browserState={knowledgeBrowser}
          knowledge={currentKnowledge}
          onDownloadKnowledgeSkill={openDownloadKnowledgeSkillConfirm}
          onOpenEntry={openKnowledgeEntry}
          onOpenFolder={openKnowledgeFolder}
          onOpenLocalObsidian={openLocalObsidian}
          onUnbindKnowledge={openUnbindKnowledgeConfirm}
        />
      );
    }

    if (viewState.viewId === "ws_tasks") {
      const workspaceAgentSessionOptions = (currentWorkspace?.agents || [])
        .map((agent) => {
          const sessionId = getAgentWorkspaceSessionId(agent);
          if (sessionId == null) return null;
          return {
            value: sessionId,
            label: agent.name || `Agent #${agent.id}`,
          };
        })
        .filter(Boolean);
      const workspaceAgentSessionIds = workspaceAgentSessionOptions.map((entry) => entry.value);
      return (
      <CronManager
        scope={{
          kind: "workspace_agent_sessions",
          workspaceId: currentWorkspace?.id,
          agentSessionIds: workspaceAgentSessionIds,
          agentSessionOptions: workspaceAgentSessionOptions,
          label: currentWorkspace?.name || "当前工作空间",
        }}
          title="任务列表"
          subtitle="统一管理当前工作空间下各个成员会话的定时任务。"
          embedded={false}
          showSummary
          emptyText="当前工作空间还没有定时任务"
          initialCreateSignal={workspaceCronCreateSignal}
          initialAgentSessionId={workspaceTaskFocusAgentSessionId}
          onInitialCreateSignalHandled={() => setWorkspaceCronCreateSignal(0)}
          onMutate={refreshCronHistoryEntry}
          onNavigateToHistory={({ kind, agentSessionId, jobId }) => {
            openCronHistory(kind, null, { agentSessionId, defaultJobId: jobId });
          }}
        />
      );
    }

    if (viewState.viewId === "cron_history" && cronHistoryContext) {
      return (
        <CronHistoryPage
          kind={cronHistoryContext.kind}
          agentSessionId={cronHistoryContext.agentSessionId}
          agentName={getHeaderTitleForCronHistory()}
          defaultJobId={cronHistoryContext.defaultJobId}
          backLabel={cronHistoryContext.sourceViewId === "ws_tasks" ? "返回任务列表" : "返回对话"}
          onBack={() => {
            if (cronHistoryContext.sourceViewId === "ws_tasks") {
              openTasks();
              return;
            }
            if (cronHistoryContext.sourceViewId === "ws_chat_hub" && cronHistoryContext.sourceAgentId != null) {
              openChatHub(cronHistoryContext.sourceAgentId);
              return;
            }
            if (cronHistoryContext.sourceViewId === "ws_agents" && cronHistoryContext.sourceAgentId != null) {
              openAgent(cronHistoryContext.sourceAgentId);
              return;
            }
            if (cronHistoryContext.sourceViewId === "agent_team_detail" && cronHistoryContext.sourceGlobalAgentId != null) {
              setViewState((prev) => ({
                ...prev,
                viewId: "agent_team_detail",
                selectedGlobalAgentId: String(cronHistoryContext.sourceGlobalAgentId),
              }));
              return;
            }
            if (cronHistoryContext.kind === "moss") {
              openGlobal();
              return;
            }
            openGlobal();
          }}
        />
      );
    }

    if (viewState.viewId === "global" || !currentWorkspace) {
      return (
        <GlobalPage
          messages={activeRuntimeChat.messages}
          isStreaming={activeRuntimeChat.status === "streaming"}
          consoleDraft={consoleDraft}
          onChangeDraft={setConsoleDraft}
          onSubmit={submitConsoleDraft}
          disabled={chatTargetConfig.disabled}
          hasMoreHistory={activeRuntimeChat.hasMoreHistory}
          isLoadingMore={activeRuntimeChat.isLoadingMore}
          onLoadMore={activeRuntimeChat.loadMoreMessages}
          onRollback={activeRuntimeChat.rollbackToMessage}
          canRollback={!activeRuntimeChat.isRollingBack && activeRuntimeChat.status !== "streaming"}
          queuedMessages={activeRuntimeChat.queuedMessages}
          onRemoveQueued={activeRuntimeChat.removeQueuedMessage}
          rollbackConfirm={activeRuntimeChat.rollbackConfirm}
          confirmRollback={activeRuntimeChat.confirmRollback}
          cancelRollback={activeRuntimeChat.cancelRollback}
          isMultimodal={activeRuntimeChat.isMultimodal}
          stopStreaming={activeRuntimeChat.stopStreaming}
          displayName={displayName}
          dropUploadContext={{ kind: "moss" }}
        />
      );
    }

    return <div className="view-empty">当前页面正在迁移到 React。</div>;
  }

  return (
    <div className="react-app">
      <LoginScreen
        visible={!auth}
        form={loginForm}
        error={loginError}
        onChange={handleLoginField}
        onSubmit={handleLogin}
      />

      {auth ? (
        <div id="app">
          {!isManageWindow && (
            <AppRail
              activeWorkspaceId={viewState.viewId === "global" || viewState.viewId === "home" ? null : viewState.wsId}
              currentUserLabel={displayLabel}
              currentViewId={viewState.viewId}
              isRefreshing={isRefreshingWorkspaces}
              showMossChatBadge={showMossChatBadge}
              workspaceChatBadgeByWorkspaceId={isManageWindow ? workspaceChatBadgeByWorkspaceId : {}}
              onOpenHome={openHome}
              onOpenGlobal={openGlobal}
              onOpenAgentTeam={openAgentTeam}
              onOpenGlobalStats={openGlobalStats}
              onOpenBizExpert={openBizExpert}
              onOpenAIMarket={openAIMarket}
              onOpenWorkspace={openWorkspace}
              onRefreshWorkspaces={handleRefreshWorkspaces}
              onToggleUserPanel={() => setUserPanelOpen((prev) => !prev)}
              onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
              onOpenScene={openScene}
              workspaces={workspaces}
            />
          )}

          {(isManageWindow || viewState.viewId === "global_stats" || viewState.viewId === "global" || viewState.viewId === "agent_team" || viewState.viewId === "agent_team_detail" || viewState.viewId === "hermes" || viewState.viewId === "openclaw" || viewState.viewId === "scene" || viewState.viewId === "ai_market" || viewState.viewId === "cron_history" || viewState.viewId.startsWith("ws_")) ? null : (
              <Sidebar
                currentWorkspace={currentWorkspace}
              isRefreshingKnowledge={isRefreshingKnowledge}
              selectedKnowledgeId={viewState.selectedKnowledgeId}
                viewId={viewState.viewId}
                chatHubBadge={Boolean(currentWorkspace && workspaceChatBadgeByWorkspaceId[currentWorkspace.id])}
                chatHubAgentId={viewState.chatHubAgentId}
                externalAgents={externalAgents}
                workspaceAgentChatBadgeById={workspaceAgentChatBadgeById}
                onOpenChatHub={openChatHub}
                onOpenAgent={openAgent}
              onOpenCreateAgent={openCreateWorkspaceAgentModal}
              onDeleteAgent={openDeleteAgentConfirm}
              onCheckExternalAgent={handleCheckExternalAgent}
                onOpenCreateKnowledge={() => {
                  setKnowledgeForm(defaultKnowledgeForm);
                  setKnowledgeFormError("");
                  setKnowledgeModalOpen(true);
                }}
              onOpenOffice={openOffice}
              onOpenTasks={openTasks}
              onOpenWorkspaceTaskBoard={openWorkspaceTaskBoard}
              onOpenKnowledge={openKnowledge}
              onRefreshKnowledge={handleRefreshKnowledge}
            />
          )}

          <main className="app-main">
            {(() => {
              if (viewState.viewId === "home") return null;
              const agentContext =
                viewState.viewId === "global"
                  ? { workingDirKind: "moss", cronKind: "moss", refId: null, sessionId: null }
                  : viewState.viewId === "ws_agents" && selectedAgent
                  ? getAgentWorkspaceSessionId(selectedAgent) != null
                    ? {
                      workingDirKind: "agent",
                      cronKind: "agent_session",
                      refId: selectedAgent.id,
                      sessionId: getAgentWorkspaceSessionId(selectedAgent),
                    }
                    : { workingDirKind: "agent", cronKind: null, refId: selectedAgent.id, sessionId: null }
                   : viewState.viewId === "ws_chat_hub" && viewState.wsId
                   ? viewState.chatHubAgentId === "__openclaw__" || viewState.chatHubAgentId === "__hermes__" || !viewState.chatHubAgentId
                     ? { workingDirKind: null, cronKind: null, refId: null, sessionId: null }
                     : (() => {
                         const workspaceSessionId = getAgentWorkspaceSessionId(
                           findAgentById(currentWorkspace?.agents, viewState.chatHubAgentId),
                         );
                         if (workspaceSessionId == null) {
                           return {
                             workingDirKind: "agent",
                             cronKind: null,
                             refId: viewState.chatHubAgentId,
                             sessionId: null,
                           };
                         }
                         return {
                         workingDirKind: "agent",
                           cronKind: "agent_session",
                           refId: viewState.chatHubAgentId,
                           sessionId: workspaceSessionId,
                         };
                       })()
                  : viewState.viewId === "agent_team_detail" && globalAgentDefaultSessionId
                  ? {
                      workingDirKind: "agent",
                      cronKind: "agent_session",
                      refId: globalAgentDetail.id,
                      sessionId: globalAgentDefaultSessionId,
                    }
                  : viewState.viewId === "cron_history" && cronHistoryContext
                  ? {
                      workingDirKind: cronHistoryContext.kind === "moss" ? "moss" : "agent",
                      cronKind: cronHistoryContext.kind === "moss" ? "moss" : "agent_session",
                      refId: cronHistoryContext.agentRefId,
                      sessionId: cronHistoryContext.agentSessionId ?? null,
                    }
                  : { workingDirKind: null, cronKind: null, refId: null, sessionId: null };
              const cronHistoryKey = agentContext.cronKind
                ? `${agentContext.cronKind}:${
                    agentContext.cronKind === "agent_session"
                      ? (agentContext.sessionId ?? "null")
                      : agentContext.cronKind
                  }`
                : null;
              const showCronHistoryEntry = viewState.viewId === "agent_team_detail"
                ? false
                : cronHistoryKey
                  ? (viewState.viewId === "cron_history" || !!cronHistoryEntryMap[cronHistoryKey])
                  : false;
              return (
                <Header
                  currentWorkspaceName={viewState.viewId === "global" || viewState.viewId === "global_stats" || viewState.viewId === "agent_team" || viewState.viewId === "agent_team_detail" || viewState.viewId === "scene" || viewState.viewId === "ai_market" || viewState.viewId === "hermes" || viewState.viewId === "openclaw" || viewState.viewId === "cron_history" ? "" : currentWorkspace?.name || ""}
                  title={getHeaderTitle()}
                  icon={getHeaderIcon()}
                  showBrand={true}
                  isHome={false}
                  onOpenExternalLink={openExternalLinkConfirm}
                  onOpenSettings={() => setSettingsModalOpen(true)}
                  onDeleteSession={handleDeleteSession}
                  workingDirKind={agentContext.workingDirKind}
                  cronKind={agentContext.cronKind}
                  agentRefId={agentContext.refId}
                  agentSessionId={agentContext.sessionId}
                  hideRuntimeActions={viewState.viewId === "agent_team_detail" || viewState.viewId === "cron_history" || viewState.viewId === "ws_chat_hub"}
                  hideWorkingDirAction={viewState.viewId === "agent_team_detail" || viewState.viewId === "ws_chat_hub"}
                  showCronHistoryEntry={showCronHistoryEntry}
                  cronHistoryReturnTarget={cronHistoryContext?.sourceViewId === "ws_tasks" ? "tasks" : "chat"}
                  onBackToTasks={() => openTasks()}
                  onOpenCronHistory={() => {
                    const kind = agentContext.cronKind;
                    openCronHistory(kind, agentContext.cronKind === "agent_session" ? Number(agentContext.refId) : null, {
                      agentSessionId: agentContext.sessionId,
                    });
                  }}
                  onCronMutated={refreshCronHistoryEntry}
                  isInCronHistory={viewState.viewId === "cron_history"}
                  onBackToChat={() => {
                    if (!cronHistoryContext) return;
                    if (cronHistoryContext.kind === "moss") {
                      openGlobal();
                    } else if (cronHistoryContext.agentSessionId != null) {
                      const meta = agentSessionIndex.get(Number(cronHistoryContext.agentSessionId));
                      if (meta?.agentId != null) {
                        setViewState((prev) => ({
                          ...prev,
                          viewId: "agent_team_detail",
                          selectedGlobalAgentId: String(meta.agentId),
                        }));
                      } else if (cronHistoryContext.agentRefId != null) {
                        setViewState((prev) => ({
                          ...prev,
                          viewId: "agent_team_detail",
                          selectedGlobalAgentId: String(cronHistoryContext.agentRefId),
                        }));
                      }
                    }
                  }}
                />
              );
            })()}

            {(viewState.viewId === "hermes" || viewState.viewId === "openclaw") && isManageWindow ? (
              <div className="app-main-body">
                <ClawSidebar
                  hideHeader
                  viewId={viewState.viewId}
                  subNav={clawSubNav}
                  onSubNavChange={setClawSubNav}
                  openclawSubNav={openclawSubNav}
                  onOpenclawSubNavChange={setOpenclawSubNav}
                  agent={hermesAgent}
                  skillsCount={hermesSkills.length}
                  jobsCount={hermesJobs.length}
                  toolsetsCount={Array.isArray(hermesToolsets) ? hermesToolsets.filter((t) => t.enabled).length : 0}
                />
                <div className="main-content-scroll">
                  {appError ? <div className="view-empty">{appError}</div> : renderMainView()}
                </div>
              </div>
            ) : viewState.viewId.startsWith("ws_") ? (
              <div className="app-main-body">
                <Sidebar
                  hideHeader
                  currentWorkspace={currentWorkspace}
                  isRefreshingKnowledge={isRefreshingKnowledge}
                  selectedKnowledgeId={viewState.selectedKnowledgeId}
                  viewId={viewState.viewId}
                  chatHubBadge={Boolean(currentWorkspace && workspaceChatBadgeByWorkspaceId[currentWorkspace.id])}
                  chatHubAgentId={viewState.chatHubAgentId}
                  externalAgents={externalAgents}
                  workspaceAgentChatBadgeById={workspaceAgentChatBadgeById}
                  onOpenChatHub={openChatHub}
                  onOpenAgent={openAgent}
                  onOpenCreateAgent={openCreateWorkspaceAgentModal}
                  onDeleteAgent={openDeleteAgentConfirm}
                  onCheckExternalAgent={handleCheckExternalAgent}
                  onOpenCreateKnowledge={() => {
                    setKnowledgeForm(defaultKnowledgeForm);
                    setKnowledgeFormError("");
                    setKnowledgeModalOpen(true);
                  }}
                  onOpenOffice={openOffice}
                  onOpenTasks={openTasks}
                  onOpenKnowledge={openKnowledge}
                  onRefreshKnowledge={handleRefreshKnowledge}
                />
                <div className="main-content-scroll">
                  {appError ? <div className="view-empty">{appError}</div> : renderMainView()}
                </div>
              </div>
            ) : (
              <div className="main-content-scroll">
                {appError ? <div className="view-empty">{appError}</div> : renderMainView()}
              </div>
            )}
          </main>

          {userPanelOpen ? (
            <div className="user-panel" ref={userPanelRef}>
              <div className="user-panel-name">{displayName}</div>
              <div className="user-panel-id">当前账号：{displayName}</div>
              <button className="user-panel-logout" type="button" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          ) : null}

          <CreateWorkspaceModal
            open={workspaceModalOpen}
            mode={workspaceModalMode}
            form={workspaceForm}
            error={workspaceFormError}
            onClose={() => {
              setWorkspaceModalOpen(false);
              setWorkspaceFormError("");
              setWorkspaceModalMode("create");
              setWorkspaceForm(defaultWorkspaceForm);
            }}
            onChange={handleWorkspaceField}
            onPickWorkingDir={handlePickWorkspaceWorkingDir}
            onSubmit={workspaceModalMode === "edit" ? handleUpdateWorkspace : handleCreateWorkspace}
            pickingWorkingDir={pickingWorkspaceWorkingDir}
          />
          <CreateAgentModal
            open={agentModalOpen}
            form={agentForm}
            error={agentFormError}
            mode={agentModalMode}
            agentOptions={globalAgents.filter((agent) => !currentWorkspace?.agents?.some((entry) => Number(entry.id) === Number(agent.id)))}
            title={agentModalMode === "global" ? "新建 Agent" : "接入 Agent"}
            description={
              agentModalMode === "global"
                ? "创建一个新的 Agent。创建后不会自动加入任何工作空间。"
                : "为当前工作空间接入一个已有 Agent。"
            }
            onClose={() => {
              setAgentModalOpen(false);
              setAgentFormError("");
              setAgentModalMode("workspace");
            }}
            onChange={handleAgentField}
            onSubmit={handleCreateAgent}
          />

          <AgentTeamConfigModal
            open={agentConfigOpen}
            agent={globalAgentDetail}
            allAgents={globalAgents}
            subagents={globalAgentSubagents}
            subagentsLoading={globalAgentSubagentsLoading}
            subagentsSaving={globalAgentSubagentsSaving}
            personas={personaCatalog}
            form={agentConfigForm}
            initialTab={agentConfigInitialTab}
            saving={agentConfigSaving}
            error={agentConfigError}
            onChange={handleAgentConfigField}
            onClose={() => {
              setAgentConfigOpen(false);
              setAgentConfigError("");
            }}
            onSaveBasic={handleSaveAgentBasic}
            onSaveModel={handleSaveAgentModel}
            onSavePersona={handleSaveAgentPersona}
            onCreateSubagent={handleCreateAgentSubagent}
            onDeleteSubagent={handleDeleteAgentSubagent}
            currentSubagentMode={globalAgentDetail?.default_session_subagent_mode ?? null}
            onChangeSubagentMode={(nextMode) =>
              updateSessionSubagentMode({
                sessionId: globalAgentDefaultSessionId,
                nextMode,
                scope: "default",
              })
            }
            subagentModeSaving={subagentModeSaving}
          />

          <ExternalAgentConfigModal
            open={Boolean(externalAgentConfigType)}
            agentType={externalAgentConfigType}
            connected={
              externalAgentConfigType === "hermes"
                ? Boolean(externalAgents?.hermes?.connected)
                : Boolean(externalAgents?.openclaw?.connected)
            }
            onClose={closeExternalAgentConfig}
            onOpenManage={() => {
              if (externalAgentConfigType === "hermes") {
                closeExternalAgentConfig();
                openHermes();
                return;
              }
              if (externalAgentConfigType === "openclaw") {
                closeExternalAgentConfig();
                openOpenClaw();
              }
            }}
            onStatusRefresh={handleCheckExternalAgent}
          />

          <WorkspaceAgentPersonaModal
            open={workspaceAgentPersonaOpen}
            agent={workspaceAgentDetail}
            personas={personaCatalog}
            onClose={closeWorkspaceAgentPersona}
            onSavePersona={saveWorkspaceAgentPersona}
            currentSubagentMode={workspaceAgentDetail?.workspace_session_subagent_mode ?? null}
            onSaveSubagentMode={saveWorkspaceAgentSubagentMode}
          />

          <CreateKnowledgeModal
            open={knowledgeModalOpen}
            form={knowledgeForm}
            error={knowledgeFormError}
            onClose={() => {
              setKnowledgeModalOpen(false);
              setKnowledgeFormError("");
            }}
            onChange={handleKnowledgeField}
            onSubmit={handleCreateKnowledge}
          />

          <SettingsModal
            isOpen={settingsModalOpen}
            onClose={() => setSettingsModalOpen(false)}
            onRequestConfirm={({ title, message, confirmLabel, action }) => {
              setConfirmState({
                open: true,
                title,
                message,
                confirmLabel: confirmLabel || "确认",
                error: "",
                action,
              });
            }}
          />

          <SettingsModal
            isOpen={workspaceSettingsModalOpen}
            onClose={() => setWorkspaceSettingsModalOpen(false)}
            mode="workspace"
            workspace={currentWorkspace}
            onRequestConfirm={({ title, message, confirmLabel, action }) => {
              setConfirmState({
                open: true,
                title,
                message,
                confirmLabel: confirmLabel || "确认",
                error: "",
                action,
              });
            }}
          />

          <ConfirmModal
            confirmLabel={confirmState.confirmLabel}
            confirmTone={confirmState.confirmTone}
            error={confirmState.error}
            message={confirmState.message}
            onClose={() => setConfirmState(emptyConfirmState)}
            onConfirm={confirmAction}
            open={confirmState.open}
            title={confirmState.title}
          />
        </div>
      ) : null}
    </div>
  );
}










