import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Bot, Zap, Building2, BarChart3, Link } from "lucide-react";
import { AppRail } from "./components/layout/AppRail";
import { ClawSidebar } from "./components/layout/ClawSidebar";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { AgentPage } from "./features/workspace/AgentPage";
import { DashboardPage } from "./features/workspace/DashboardPage";
import { ItemPage } from "./features/workspace/ItemPage";
import { OfficePage } from "./features/workspace/OfficePage";
import { getOfficeSelectionState } from "./features/workspace/office/officeSelection";
import { KnowledgePage } from "./features/workspace/KnowledgePage";
import { PMPage } from "./features/workspace/PMPage";
import { ChatHubPage } from "./features/workspace/ChatHubPage";
import { ResultsPage } from "./features/standalone/ResultsPage";
import { GlobalPage } from "./features/global/GlobalPage";
import { GlobalStatsPage } from "./features/stats/GlobalStatsPage";
import { ConfirmModal } from "./features/modals/ConfirmModal";
import { CreateItemModal } from "./features/modals/CreateItemModal";
import { CreateAgentModal } from "./features/modals/CreateAgentModal";
import { CreateKnowledgeModal } from "./features/modals/CreateKnowledgeModal";
import { CreateWorkspaceModal } from "./features/modals/CreateWorkspaceModal";
import { ItemBasicsModal } from "./features/modals/ItemBasicsModal";
import { ResultDetailModal } from "./features/modals/ResultDetailModal";
import { ReviewHistoryModal } from "./features/modals/ReviewHistoryModal";
import { SubmitResultModal } from "./features/modals/SubmitResultModal";
import SettingsModal from "./features/modals/SettingsModal";
import HermesPage from "./features/hermes/HermesPage";
import { hermesApi } from "./features/hermes/hermesApi";
import { OpenClawPage, openclawApi } from "./features/openclaw";
import { openclawGateway } from "./features/openclaw/openclawGateway";
import { openclawConfigApi } from "./features/openclaw/openclawConfigApi";
import { OtherAgentDashboardPage } from "./features/other-agent/OtherAgentDashboardPage";
import { useRuntimeChat } from "./features/chat/useRuntimeChat";
import { usePersistentSuperAgentChats } from "./features/chat/usePersistentSuperAgentChats";
import { usePersistentWorkAgentChats } from "./features/chat/usePersistentWorkAgentChats";
import { CronHistoryPage } from "./features/cron/CronHistoryPage";
import { isHermesConfigured, isOpenClawConfigured } from "./features/external-agents/configStatus";
import {
  clearStoredAuth,
  getCurrentUserDisplayName,
  getCurrentUserLabel,
  getStoredAuth,
  setStoredAuth,
} from "./lib/auth";
import { buildWorkspaceFromApi, hydrateWorkspacesFromApi } from "./lib/builders";
import { api } from "./lib/api";

const defaultLoginForm = { username: "", password: "" };
const defaultWorkspaceForm = { name: "", super_agent_nick_name: "项目经理", goal: "" };
const defaultItemForm = {
  name: "",
  description: "",
  work_requirement: "",
  delivery_requirement: "",
  need_superagent_review: true,
  need_superone_review: false,
};
const defaultAgentForm = { name: "" };
const defaultKnowledgeForm = { name: "", port: "", api_key: "", omnisearch_port: "" };
const defaultSubmitResultForm = { title: "", summary: "", files: [] };
const defaultItemBasicsForm = {
  name: "",
  description: "",
  work_requirement: "",
  delivery_requirement: "",
  need_superagent_review: true,
  need_superone_review: false,
};
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
  selectedItemId: null,
  selectedKnowledgeId: null,
  dashboardOrigin: null,
  chatHubAgentId: null,
};

// Keep the legacy home/intro page in the codebase for possible future reuse.
// It is intentionally hidden from the current navigation and login flow.
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
            <div className="login-register-hint">
              请前往
              <a
                href="https://www.camphorjoy.com/register"
                target="_blank"
                rel="noreferrer"
              >
                Camphor开源社区
              </a>
              ，免费注册你的账号。
            </div>
          </form>
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
  const initialDefaultJobIdFromUrl = urlParams.get('defaultJobId');

  const [viewState, setViewState] = useState(() => {
    if (manageType === 'workspace' && manageWsId) {
      return {
        viewId: initialViewFromUrl || "ws_office",
        wsId: manageWsId,
        selectedAgentId: initialAgentIdFromUrl || null,
        selectedItemId: null,
        selectedKnowledgeId: null,
        chatHubAgentId: initialAgentIdFromUrl || null,
      };
    }
    if (manageType === 'hermes') {
      return {
        viewId: "hermes",
        wsId: null,
        selectedAgentId: null,
        selectedItemId: null,
        selectedKnowledgeId: null,
        chatHubAgentId: null,
      };
    }
    if (manageType === 'openclaw') {
      return {
        viewId: "openclaw",
        wsId: null,
        selectedAgentId: null,
        selectedItemId: null,
        selectedKnowledgeId: null,
        chatHubAgentId: null,
      };
    }
    if (initialViewFromUrl === 'global') {
      return { ...defaultViewState, viewId: "global" };
    }
    return defaultViewState;
  });
  const [loading, setLoading] = useState(false);
  const [appError, setAppError] = useState("");
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

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemForm, setItemForm] = useState(defaultItemForm);
  const [itemFormError, setItemFormError] = useState("");

  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentForm, setAgentForm] = useState(defaultAgentForm);
  const [agentFormError, setAgentFormError] = useState("");

  const [bindAgentModalOpen, setBindAgentModalOpen] = useState(false);
  const [bindAgentError, setBindAgentError] = useState("");

  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [knowledgeForm, setKnowledgeForm] = useState(defaultKnowledgeForm);
  const [knowledgeFormError, setKnowledgeFormError] = useState("");

  const [submitResultModalOpen, setSubmitResultModalOpen] = useState(false);
  const [submitResultForm, setSubmitResultForm] = useState(defaultSubmitResultForm);
  const [submitResultError, setSubmitResultError] = useState("");

  const [selectedResultId, setSelectedResultId] = useState(null);
  const [itemHistoryPage, setItemHistoryPage] = useState(1);
  const [itemBasicsOpen, setItemBasicsOpen] = useState(false);
  const [itemBasicsForm, setItemBasicsForm] = useState(defaultItemBasicsForm);
  const [itemBasicsError, setItemBasicsError] = useState("");

  const [confirmState, setConfirmState] = useState(emptyConfirmState);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [workspaceSettingsModalOpen, setWorkspaceSettingsModalOpen] = useState(false);
  const [isRefreshingWorkspaces, setIsRefreshingWorkspaces] = useState(false);
  const [isRefreshingAgents, setIsRefreshingAgents] = useState(false);
  const [isRefreshingItems, setIsRefreshingItems] = useState(false);
  const [isRefreshingKnowledge, setIsRefreshingKnowledge] = useState(false);

  const [cronHistoryEntryMap, setCronHistoryEntryMap] = useState({});
  const [cronHistoryContext, setCronHistoryContext] = useState(null);

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
  const [seenSuperAgentCompletionByWorkspaceId, setSeenSuperAgentCompletionByWorkspaceId] = useState({});
  const [seenWorkAgentCompletionById, setSeenWorkAgentCompletionById] = useState({});

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === String(viewState.wsId)) || null,
    [workspaces, viewState.wsId],
  );
  const currentItem = useMemo(
    () =>
      currentWorkspace?.items.find((item) => item.id === viewState.selectedItemId) ||
      currentWorkspace?.items[0] ||
      null,
    [currentWorkspace, viewState.selectedItemId],
  );
  const currentKnowledge = useMemo(
    () =>
      currentWorkspace?.knowledge.find((entry) => entry.id === viewState.selectedKnowledgeId) ||
      currentWorkspace?.knowledge[0] ||
      null,
    [currentWorkspace, viewState.selectedKnowledgeId],
  );
  const selectedResultEntry = useMemo(
    () => currentWorkspace?.items.flatMap((item) => item.submissions).find((entry) => entry.id === selectedResultId) || null,
    [currentWorkspace, selectedResultId],
  );
  const selectedAgent = useMemo(
    () =>
      currentWorkspace?.agents.find((agent) => agent.id === viewState.selectedAgentId) ||
      currentWorkspace?.agents[0] ||
      null,
    [currentWorkspace, viewState.selectedAgentId],
  );

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
    if (!currentWorkspace) {
      return {
        disabled: true,
        options: [{ value: "", label: "当前没有可用对话对象" }],
        selected: "",
      };
    }
    if (viewState.viewId === "ws_dashboard" || viewState.viewId === "ws_office" || viewState.viewId === "ws_kb") {
      return {
        disabled: false,
        options: [
          { value: "moss", label: "MOSS" },
          { value: "pm", label: currentWorkspace.superAgentName || "项目经理" },
        ],
        selected: "moss",
      };
    }
    if (viewState.viewId === "ws_pm") {
      return {
        disabled: false,
        options: [{ value: "pm", label: currentWorkspace.superAgentName || "项目经理" }],
        selected: "pm",
      };
    }
    if (viewState.viewId === "ws_agents") {
      return {
        disabled: false,
        options: [{ value: "agent", label: selectedAgent?.name || "WorkAgent" }],
        selected: "agent",
      };
    }
    if (viewState.viewId === "global_stats") {
      return {
        disabled: true,
        options: [{ value: "", label: "Dashboard" }],
        selected: "",
      };
    }
    if (viewState.viewId === "ws_chat_hub") {
      if (viewState.chatHubAgentId === "__openclaw__") {
        return {
          disabled: true,
          options: [{ value: "openclaw", label: "OpenClaw" }],
          selected: "openclaw",
        };
      }
      if (viewState.chatHubAgentId === "__hermes__") {
        return {
          disabled: true,
          options: [{ value: "hermes", label: "Hermes" }],
          selected: "hermes",
        };
      }
      if (!viewState.chatHubAgentId) {
        return {
          disabled: false,
          options: [{ value: "pm", label: currentWorkspace.superAgentName || "项目经理" }],
          selected: "pm",
        };
      }
      const agent = currentWorkspace?.agents.find(
        (a) => String(a.id) === String(viewState.chatHubAgentId)
      );
      return {
        disabled: false,
        options: [{ value: "agent", label: agent?.name || "WorkAgent" }],
        selected: "agent",
      };
    }
    if (viewState.viewId === "ws_items") {
      return {
        disabled: true,
        options: [{ value: "", label: "WorkAgent 聊天请切换到工作代理页面" }],
        selected: "",
      };
    }
    return {
      disabled: false,
      options: [{ value: "moss", label: "MOSS" }],
      selected: "moss",
    };
  }, [currentWorkspace, viewState.viewId]);

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

  // Use persistent multi-workspace chat manager for SuperAgent
  // This maintains separate WebSocket connections for recently accessed workspaces
  // to prevent agent response interruption when switching workspaces
  const superAgentChat = usePersistentSuperAgentChats(workspaces, currentWorkspace?.id, !isWorkspaceView);
  const superAgentCompletionByWorkspaceId = superAgentChat.completionByWorkspaceId || {};

  const showMossChatBadge =
    Boolean(mossChat.lastCompletedAt) && mossChat.lastCompletedAt > seenMossCompletionAt && viewState.viewId !== "global";
  const superAgentChatBadgeByWorkspaceId = useMemo(() => {
    return Object.fromEntries(
      workspaces.map((workspace) => {
        const completedAt = superAgentCompletionByWorkspaceId[workspace.id] || 0;
        const seenAt = seenSuperAgentCompletionByWorkspaceId[workspace.id] || 0;
        const isCurrentPM = (viewState.viewId === "ws_pm" || (viewState.viewId === "ws_chat_hub" && !viewState.chatHubAgentId)) && String(viewState.wsId) === workspace.id;
        return [workspace.id, Boolean(completedAt) && completedAt > seenAt && !isCurrentPM];
      }),
    );
  }, [workspaces, superAgentCompletionByWorkspaceId, seenSuperAgentCompletionByWorkspaceId, viewState.viewId, viewState.wsId]);

  useEffect(() => {
    if (viewState.viewId === "global" && mossChat.lastCompletedAt) {
      setSeenMossCompletionAt((prev) => Math.max(prev, mossChat.lastCompletedAt));
    }
  }, [viewState.viewId, mossChat.lastCompletedAt]);

  useEffect(() => {
    if (
      (viewState.viewId !== "ws_pm" && viewState.viewId !== "ws_chat_hub") ||
      !currentWorkspace?.id
    )
      return;
    const completedAt = superAgentCompletionByWorkspaceId[currentWorkspace.id] || 0;
    if (!completedAt) return;
    setSeenSuperAgentCompletionByWorkspaceId((prev) => ({
      ...prev,
      [currentWorkspace.id]: Math.max(prev[currentWorkspace.id] || 0, completedAt),
    }));
  }, [viewState.viewId, currentWorkspace?.id, superAgentCompletionByWorkspaceId]);

  const workAgentChatCurrentAgentId = useMemo(() => {
    if (viewState.viewId === "ws_agents") return viewState.selectedAgentId;
    if (viewState.viewId === "ws_chat_hub") {
      // 外部智能体不占用 workAgent chat 槽位
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

  const workAgentChat = usePersistentWorkAgentChats(
    currentWorkspace?.agents || [],
    workAgentChatCurrentAgentId,
    currentWorkspace ? String(currentWorkspace.id) : null,
    viewState.selectedItemId,
    !isWorkspaceView,
    officePriorityAgentIds,
  );
  const workAgentCompletionById = workAgentChat.completionByAgentId || {};

  const workAgentChatBadgeById = useMemo(() => {
    if (!currentWorkspace?.agents) return {};
    return Object.fromEntries(
      currentWorkspace.agents.map((agent) => {
        const completedAt = workAgentCompletionById[String(agent.id)] || 0;
        const seenAt = seenWorkAgentCompletionById[String(agent.id)] || 0;
        const isCurrentAgent = (viewState.viewId === "ws_agents" && String(viewState.selectedAgentId) === String(agent.id)) || (viewState.viewId === "ws_chat_hub" && String(viewState.chatHubAgentId) === String(agent.id));
        return [String(agent.id), Boolean(completedAt) && completedAt > seenAt && !isCurrentAgent];
      }),
    );
  }, [currentWorkspace?.agents, workAgentCompletionById, seenWorkAgentCompletionById, viewState.viewId, viewState.selectedAgentId]);

  const globalStats = useMemo(() => {
    const workspaceCount = workspaces.length;
    const itemCount = workspaces.reduce((sum, w) => sum + (w.items?.length || 0), 0);
    const submissionCount = workspaces.reduce((sum, w) => {
      return sum + (w.items?.reduce((s, i) => s + (i.submissions?.length || 0), 0) || 0);
    }, 0);
    const knowledgeCount = workspaces.reduce((sum, w) => sum + (w.knowledge?.length || 0), 0);
    const superAgentCount = workspaces.length;
    const workAgentCount = workspaces.reduce((sum, w) => sum + (w.agents?.length || 0), 0);
    return {
      workspaceCount,
      itemCount,
      submissionCount,
      knowledgeCount,
      superAgentCount,
      workAgentCount,
      hermesConnected: externalAgents.hermes.connected,
      openclawConnected: externalAgents.openclaw.connected,
    };
  }, [workspaces, externalAgents]);

  const workspaceChatBadgeByWorkspaceId = useMemo(() => {
    return Object.fromEntries(
      workspaces.map((workspace) => {
        const hasSuperAgentBadge = Boolean(superAgentChatBadgeByWorkspaceId[workspace.id]);
        let hasWorkAgentBadge = false;
        if (currentWorkspace && String(currentWorkspace.id) === String(workspace.id) && workAgentChatBadgeById) {
          hasWorkAgentBadge = Object.values(workAgentChatBadgeById).some(Boolean);
        }
        return [workspace.id, hasSuperAgentBadge || hasWorkAgentBadge];
      }),
    );
  }, [workspaces, superAgentChatBadgeByWorkspaceId, workAgentChatBadgeById, currentWorkspace]);

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
    const completedAt = workAgentCompletionById[currentAgentId] || 0;
    if (!completedAt) return;
    setSeenWorkAgentCompletionById((prev) => ({
      ...prev,
      [currentAgentId]: Math.max(prev[currentAgentId] || 0, completedAt),
    }));
  }, [viewState.viewId, viewState.selectedAgentId, viewState.chatHubAgentId, workAgentCompletionById]);

  // Select the active chat based on current view
  const activeRuntimeChat = useMemo(() => {
    if (viewState.viewId === "global_stats") {
      return mossChat;
    }
    if (viewState.viewId === "global") {
      return mossChat;
    }
    if (viewState.viewId === "ws_pm") {
      return superAgentChat;
    }
    if (viewState.viewId === "ws_agents") {
      return workAgentChat;
    }
    if (viewState.viewId === "ws_chat_hub") {
      if (viewState.chatHubAgentId === "__openclaw__" || viewState.chatHubAgentId === "__hermes__") {
        // 外部智能体聊天在 ChatHubPage 内部自行管理，这里返回 mossChat 作为占位
        return mossChat;
      }
      if (!viewState.chatHubAgentId) {
        return superAgentChat;
      }
      return workAgentChat;
    }
    // For other views (dashboard, items, kb), use moss or superagent based on selectedChatTarget
    if (activeChatTarget === "pm" && currentWorkspace) {
      return superAgentChat;
    }
    return mossChat;
  }, [viewState.viewId, activeChatTarget, currentWorkspace, mossChat, superAgentChat, workAgentChat]);

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
    hydrateWorkspacesFromApi()
      .then((data) => {
        setWorkspaces(data);
        if (manageType === 'workspace' && manageWsId && initialViewFromUrl === 'cron_history') {
          if (initialAgentIdFromUrl) {
            const agent = data.flatMap((w) => w.agents || []).find((a) => String(a.id) === String(initialAgentIdFromUrl));
            setCronHistoryContext({
              kind: "workagent",
              targetId: Number(initialAgentIdFromUrl),
              agentName: agent?.name || "WorkAgent",
              defaultJobId: initialDefaultJobIdFromUrl ? Number(initialDefaultJobIdFromUrl) : undefined,
            });
          } else {
            const ws = data.find((w) => String(w.id) === String(manageWsId) || String(w.rawId) === String(manageWsId));
            setCronHistoryContext({
              kind: "workspace_superagent",
              targetId: Number(manageWsId),
              agentName: ws?.superAgentName || ws?.name || "项目经理",
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
                superAgentName: raw.super_agent_nick_name || existing.superAgentName,
              };
            }
            return {
              id,
              rawId: raw.id,
              name: raw.name,
              goal: raw.goal || "待补充工作总目标",
              superAgentName: raw.super_agent_nick_name || "项目经理",
              projectManager: { name: raw.super_agent_nick_name || "项目经理", status: "在线" },
              dashboard: { agentCount: 0, itemCount: 0, todoCount: 0, knowledgeCount: 0, resultCount: 0 },
              agents: [],
              items: [],
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

  // 工作空间视图下定时刷新当前空间详情（agents/items/knowledge/dashboard/histories）
  useEffect(() => {
    if (!auth || !currentWorkspace?.rawId) return;
    if (!viewState.viewId.startsWith("ws_")) return;

    const REFRESH_INTERVAL = 30000;
    const refreshDetail = async () => {
      try {
        await reloadCurrentWorkspace();
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
      const data = await hydrateWorkspacesFromApi();
      setWorkspaces(data);
    } catch (error) {
      console.error("手动刷新失败:", error);
    } finally {
      setIsRefreshingWorkspaces(false);
    }
  }

  // 刷新 Agent 列表
  async function handleRefreshAgents() {
    if (isRefreshingAgents || !currentWorkspace?.rawId) return;
    setIsRefreshingAgents(true);
    try {
      const nextWorkspace = await reloadCurrentWorkspace();
      if (nextWorkspace) {
        setWorkspaces((prev) =>
          prev.map((workspace) => (workspace.id === nextWorkspace.id ? nextWorkspace : workspace))
        );
      }
    } catch (error) {
      console.error("刷新Agent列表失败:", error);
    } finally {
      setIsRefreshingAgents(false);
    }
  }

  // 刷新任务列表
  async function handleRefreshItems() {
    if (isRefreshingItems || !currentWorkspace?.rawId) return;
    setIsRefreshingItems(true);
    try {
      const nextWorkspace = await reloadCurrentWorkspace();
      if (nextWorkspace) {
        setWorkspaces((prev) =>
          prev.map((workspace) => (workspace.id === nextWorkspace.id ? nextWorkspace : workspace))
        );
      }
    } catch (error) {
      console.error("刷新任务列表失败:", error);
    } finally {
      setIsRefreshingItems(false);
    }
  }

  // 刷新知识库列表
  async function handleRefreshKnowledge() {
    if (isRefreshingKnowledge || !currentWorkspace?.rawId) return;
    setIsRefreshingKnowledge(true);
    try {
      const nextWorkspace = await reloadCurrentWorkspace();
      if (nextWorkspace) {
        setWorkspaces((prev) =>
          prev.map((workspace) => (workspace.id === nextWorkspace.id ? nextWorkspace : workspace))
        );
      }
    } catch (error) {
      console.error("刷新知识库列表失败:", error);
    } finally {
      setIsRefreshingKnowledge(false);
    }
  }

  useEffect(() => {
    setItemHistoryPage(1);
  }, [viewState.selectedItemId]);

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
    setViewState(defaultViewState);
    setUserPanelOpen(false);
  }

  function handleWorkspaceField(field, value) {
    setWorkspaceForm((prev) => ({ ...prev, [field]: value }));
    setWorkspaceFormError("");
  }

  function handleItemField(field, value) {
    setItemForm((prev) => ({ ...prev, [field]: value }));
    setItemFormError("");
  }

  function handleAgentField(field, value) {
    setAgentForm((prev) => ({ ...prev, [field]: value }));
    setAgentFormError("");
  }

  function handleKnowledgeField(field, value) {
    setKnowledgeForm((prev) => ({ ...prev, [field]: value }));
    setKnowledgeFormError("");
  }

  function handleItemBasicsField(field, value) {
    setItemBasicsForm((prev) => ({ ...prev, [field]: value }));
    setItemBasicsError("");
  }

  async function handleCreateWorkspace() {
    const name = workspaceForm.name.trim();
    const goal = workspaceForm.goal.trim();
    const superAgentNickName = workspaceForm.super_agent_nick_name.trim() || "项目经理";

    if (!name || !goal) {
      setWorkspaceFormError("请先填写名称和核心目标。");
      return;
    }

    try {
      const created = await api.createWorkspace({
        ...workspaceForm,
        name,
        goal,
        super_agent_nick_name: superAgentNickName,
      });
      const nextWorkspace = await buildWorkspaceFromApi(created);
      setWorkspaces((prev) => [...prev, nextWorkspace]);
      setViewState({
        viewId: "ws_dashboard",
        wsId: nextWorkspace.id,
        selectedAgentId: null,
        selectedItemId: nextWorkspace.items[0]?.id || null,
        selectedKnowledgeId: nextWorkspace.knowledge[0]?.id || null,
        chatHubAgentId: null,
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

    if (!name) {
      setWorkspaceFormError("工作空间名称不能为空。");
      return;
    }

    setWorkspaceFormError("");
    try {
      await api.updateWorkspace(currentWorkspace.rawId, {
        name,
        goal: goal || null,
      });
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === currentWorkspace.id
            ? {
                ...ws,
                name,
                goal: goal || "待补充工作总目标",
              }
            : ws
        )
      );
      setWorkspaceModalOpen(false);
      setWorkspaceForm(defaultWorkspaceForm);
      setWorkspaceModalMode("create");
    } catch (error) {
      setWorkspaceFormError(error.message);
    }
  }

  async function handleCreateItem() {
    if (!currentWorkspace?.rawId) return;
    const name = itemForm.name.trim();
    if (!name) {
      setItemFormError("请先填写任务名。");
      return;
    }

    try {
      const created = await api.createItem(currentWorkspace.rawId, {
        work_space_id: currentWorkspace.rawId,
        name,
        description: itemForm.description.trim(),
        work_requirement: itemForm.work_requirement.trim(),
        delivery_requirement: itemForm.delivery_requirement.trim(),
        need_superagent_review: Boolean(itemForm.need_superagent_review),
        need_superone_review: Boolean(itemForm.need_superone_review),
        allow_auto_complete: false,
      });
      const nextWorkspace = await reloadCurrentWorkspace();
      setItemModalOpen(false);
      setItemForm(defaultItemForm);
      setItemFormError("");
      setViewState((prev) => ({
        ...prev,
        viewId: "ws_items",
        selectedItemId:
          String(created?.id || "") ||
          nextWorkspace?.items.find((entry) => entry.title === name)?.id ||
          nextWorkspace?.items[0]?.id ||
          null,
      }));
    } catch (error) {
      setItemFormError(error.message);
    }
  }

  async function handleCreateAgent() {
    if (!currentWorkspace?.rawId) return;
    const name = agentForm.name.trim();
    if (!name) {
      setAgentFormError("请先填写智能体名称。");
      return;
    }

    try {
      await api.createAgent(currentWorkspace.rawId, {
        work_space_id: currentWorkspace.rawId,
        name,
      });
      const nextWorkspace = await reloadCurrentWorkspace();
      setAgentModalOpen(false);
      setAgentForm(defaultAgentForm);
      setAgentFormError("");
      setViewState((prev) => ({
        ...prev,
        viewId: "ws_chat_hub",
        chatHubAgentId: nextWorkspace?.agents.find((agent) => agent.name === name)?.id || null,
      }));
    } catch (error) {
      setAgentFormError(error.message);
    }
  }

  function openBindAgentConfirm(agentId, agentName) {
    if (!currentItem?.id) return;
    setConfirmState({
      open: true,
      title: "设定 workAgent",
      message: `确认将 workAgent「${agentName}」绑定到任务「${currentItem.title}」吗？`,
      confirmLabel: "确认绑定",
      error: "",
      action: async () => {
        await api.bindItemAgent(currentItem.id, agentId);
        await reloadCurrentWorkspace();
        setBindAgentModalOpen(false);
        setBindAgentError("");
      },
    });
  }

  function openUnbindAgentConfirm() {
    if (!currentItem?.id) return;
    setConfirmState({
      open: true,
      title: "解绑 workAgent",
      message: `确认解除任务「${currentItem.title}」与 workAgent「${currentItem.ownerName || ""}」的绑定关系吗？`,
      confirmLabel: "确认解绑",
      error: "",
      action: async () => {
        await api.bindItemAgent(currentItem.id, null);
        await reloadCurrentWorkspace();
        setBindAgentError("");
      },
    });
  }

  async function handleCreateKnowledge() {
    if (!currentWorkspace?.rawId) return;
    const name = knowledgeForm.name.trim();
    const port = knowledgeForm.port.trim();
    const apiKey = knowledgeForm.api_key.trim();
    const omnisearchPort = knowledgeForm.omnisearch_port.trim();
    if (!name || !port || !apiKey || !omnisearchPort) {
      setKnowledgeFormError("请完整填写 Obsidian Vault 名称、Local REST 端口、Omnisearch 端口和 API Key。");
      return;
    }

    try {
      const created = await api.createKnowledge(currentWorkspace.rawId, {
        name,
        port: Number(port),
        api_key: apiKey,
        omnisearch_port: Number(omnisearchPort),
      });
      const nextWorkspace = await reloadCurrentWorkspace();
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

  function openItemBasicsModal() {
    if (!currentItem) return;
    setItemBasicsForm({
      name: currentItem.title || "",
      description: currentItem.desc || "",
      work_requirement: currentItem.workRequirement || "",
      delivery_requirement: currentItem.deliveryRequirement || "",
      need_superagent_review: Boolean(currentItem.needSuperagentReview),
      need_superone_review: Boolean(currentItem.needSuperoneReview),
    });
    setItemBasicsError("");
    setItemBasicsOpen(true);
  }

  async function saveItemBasics() {
    if (!currentItem) return;
    const name = itemBasicsForm.name.trim();
    if (!name) {
      setItemBasicsError("任务名称不能为空。");
      return;
    }
    try {
      await api.updateItem(currentItem.id, {
        name,
        description: itemBasicsForm.description.trim(),
        work_requirement: itemBasicsForm.work_requirement.trim(),
        delivery_requirement: itemBasicsForm.delivery_requirement.trim(),
        need_superagent_review: Boolean(itemBasicsForm.need_superagent_review),
        need_superone_review: Boolean(itemBasicsForm.need_superone_review),
      });
      await reloadCurrentWorkspace();
      setItemBasicsOpen(false);
      setItemBasicsError("");
    } catch (error) {
      setItemBasicsError(error.message || "保存失败");
    }
  }

  function openWorkspace(workspace) {
    setViewState({
      viewId: "ws_dashboard",
      wsId: workspace.id,
      selectedAgentId: workspace.agents[0]?.id || null,
      selectedItemId: workspace.items[0]?.id || null,
      selectedKnowledgeId: workspace.knowledge[0]?.id || null,
      chatHubAgentId: null,
      dashboardOrigin: "workspace_list",
    });
  }

  function navigateTo(nextView) {
    setViewState((prev) => ({ ...prev, viewId: nextView }));
  }

  function openGlobal() {
    setViewState((prev) => ({
      ...defaultViewState,
      viewId: "global",
      wsId: prev.wsId,
    }));
  }

  function openGlobalStats() {
    setViewState((prev) => ({
      ...defaultViewState,
      viewId: "global_stats",
      wsId: prev.wsId,
    }));
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
    if (viewState.viewId === "hermes" || viewState.viewId === "other_agent_hub") {
      loadHermesData();
    }
  }, [viewState.viewId, loadHermesData]);

  function openOtherAgentHub() {
    setViewState((prev) => ({ ...defaultViewState, viewId: "other_agent_hub" }));
  }

  function openHermes() {
    setViewState((prev) => ({ ...defaultViewState, viewId: "hermes" }));
    setClawSubNav("agent");
  }

  function openOpenClaw() {
    setViewState((prev) => ({ ...defaultViewState, viewId: "openclaw" }));
    setOpenclawSubNav("overview");
  }

  function openOffice() {
    navigateTo("ws_office");
  }

  function openDashboard() {
    setViewState((prev) => ({ ...prev, viewId: "ws_dashboard", dashboardOrigin: "sidebar" }));
  }

  function openChatHub() {
    setViewState((prev) => ({
      ...prev,
      viewId: "ws_chat_hub",
      chatHubAgentId: null, // 默认选中 PM
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

  function openPM() {
    openChatHub(); // 重定向到 ChatHub，默认 PM
  }

  function openAgent(agentId) {
    setViewState((prev) => ({
      ...prev,
      viewId: "ws_chat_hub",
      chatHubAgentId: agentId,
    }));
  }

  function openItem(itemId) {
    setViewState((prev) => ({ ...prev, viewId: "ws_items", selectedItemId: itemId }));
  }

  function openKnowledge(knowledgeId) {
    setViewState((prev) => ({ ...prev, viewId: "ws_kb", selectedKnowledgeId: knowledgeId }));
  }

  function openCronHistory(kind, targetId, { defaultJobId } = {}) {
    let agentName = "";
    if (kind === "moss") {
      agentName = "MOSS";
    } else if (kind === "workspace_superagent") {
      const ws = workspaces.find(
        (w) => String(w.id) === String(targetId) || String(w.rawId) === String(targetId)
      );
      agentName = ws?.superAgentName || ws?.name || "项目经理";
    } else if (kind === "workagent") {
      const agent = workspaces
        .flatMap((w) => w.agents || [])
        .find((a) => String(a.id) === String(targetId));
      agentName = agent?.name || "WorkAgent";
    }
    setCronHistoryContext({ kind, targetId, agentName, defaultJobId });
    setViewState((prev) => ({ ...prev, viewId: "cron_history" }));
  }

  const refreshCronHistoryEntry = useCallback(() => {
    if (!auth) return;
    let kind, targetId;
    if (viewState.viewId === "global") {
      kind = "moss";
      targetId = null;
    } else if (viewState.viewId === "ws_pm" || (viewState.viewId === "ws_chat_hub" && !viewState.chatHubAgentId)) {
      kind = "workspace_superagent";
      targetId = viewState.wsId ? Number(viewState.wsId) : null;
    } else if (viewState.viewId === "ws_agents" && viewState.selectedAgentId) {
      kind = "workagent";
      targetId = Number(viewState.selectedAgentId);
    } else if (viewState.viewId === "ws_chat_hub" && viewState.chatHubAgentId && viewState.chatHubAgentId !== "__openclaw__" && viewState.chatHubAgentId !== "__hermes__") {
      kind = "workagent";
      targetId = Number(viewState.chatHubAgentId);
    } else {
      return;
    }
    if (!kind) return;
    const key = `${kind}:${targetId ?? "null"}`;
    api.getCronHistoryList({ kind, targetId })
      .then((data) => {
        setCronHistoryEntryMap((prev) => ({
          ...prev,
          [key]: (data.jobs?.length || 0) > 0,
        }));
      })
      .catch(() => {
        setCronHistoryEntryMap((prev) => ({ ...prev, [key]: false }));
      });
  }, [auth, viewState.viewId, viewState.wsId, viewState.selectedAgentId, viewState.chatHubAgentId]);

  // Prefetch cron existence for current agent scope to drive Header entry visibility
  useEffect(() => {
    refreshCronHistoryEntry();
  }, [refreshCronHistoryEntry]);

  function getHeaderTitle() {
    if (viewState.viewId === "home") return "Mini8 生态";
    if (viewState.viewId === "global") return "MOSS";
    if (viewState.viewId === "ws_dashboard") return "运行总览";
    if (viewState.viewId === "ws_office") return "工作室";
    if (viewState.viewId === "ws_pm") return currentWorkspace?.superAgentName || "项目经理";
    if (viewState.viewId === "ws_agents") return selectedAgent?.name || "Agent团队";
    if (viewState.viewId === "global_stats") return "看板";
    if (viewState.viewId === "ws_chat_hub") {
      if (viewState.chatHubAgentId === "__openclaw__") return "OpenClaw";
      if (viewState.chatHubAgentId === "__hermes__") return "Hermes";
      if (!viewState.chatHubAgentId) return currentWorkspace?.superAgentName || "项目经理";
      const agent = currentWorkspace?.agents.find(
        (a) => String(a.id) === String(viewState.chatHubAgentId)
      );
      return agent?.name || "WorkAgent";
    }
    if (viewState.viewId === "ws_items") return currentItem?.title || "任务卡片";
    if (viewState.viewId === "ws_kb") return currentKnowledge?.title || "知识库列表";
    if (viewState.viewId === "standalone_results") return "项目成果库";
    if (viewState.viewId === "hermes" || viewState.viewId === "openclaw") return "连接智能体";
    if (viewState.viewId === "other_agent_hub") return "连接智能体";
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
    if (viewState.viewId === "global_stats") return <BarChart3 size={size} strokeWidth={strokeWidth} className="header-stats-icon" />;
    if (viewState.viewId === "ws_office") return <Building2 size={size} strokeWidth={strokeWidth} className="header-office-icon" />;
    if (viewState.viewId === "hermes") return <Bot size={size} strokeWidth={strokeWidth} className="header-claw-icon" />;
    if (viewState.viewId === "openclaw") return <Zap size={size} strokeWidth={strokeWidth} className="header-claw-icon" />;
    if (viewState.viewId === "other_agent_hub") return <Link size={size} strokeWidth={strokeWidth} className="header-other-agent-icon" />;
    return <Brain size={size} strokeWidth={strokeWidth} className="header-moss-icon" />;
  }

  async function reloadCurrentWorkspace() {
    if (!currentWorkspace?.rawId) return null;
    const nextWorkspace = await buildWorkspaceFromApi({
      id: currentWorkspace.rawId,
      name: currentWorkspace.name,
      goal: currentWorkspace.goal,
      super_agent_nick_name: currentWorkspace.superAgentName,
    });
    setWorkspaces((prev) =>
      prev.map((workspace) => (workspace.id === nextWorkspace.id ? nextWorkspace : workspace)),
    );
    return nextWorkspace;
  }

  function updateSubmitResultField(field, value) {
    setSubmitResultForm((prev) => ({ ...prev, [field]: value }));
    setSubmitResultError("");
  }

  function openSubmitResultModal() {
    setSubmitResultForm(defaultSubmitResultForm);
    setSubmitResultError("");
    setSubmitResultModalOpen(true);
  }

  async function submitCurrentItemResult() {
    if (!currentItem) return;
    const title = submitResultForm.title.trim();
    const summary = submitResultForm.summary.trim();
    if (!title) {
      setSubmitResultError("请先填写成果标题。");
      return;
    }
    if (!summary) {
      setSubmitResultError("请填写成果说明或文本内容。");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("summary", summary);
      if (auth?.user_id) {
        formData.append("submitted_by_user_id", String(auth.user_id));
      }
      formData.append("submitted_by_name", getCurrentUserDisplayName(auth));
      submitResultForm.files.forEach((file) => formData.append("files", file));
      await api.uploadHistory(currentItem.id, formData);
      await reloadCurrentWorkspace();
      setSubmitResultModalOpen(false);
      setSubmitResultForm(defaultSubmitResultForm);
    } catch (error) {
      setSubmitResultError(error.message);
    }
  }

  function openDeleteHistoryConfirm(historyId) {
    const entry = currentItem?.submissions.find((candidate) => candidate.id === historyId);
    setConfirmState({
      open: true,
      title: "删除成果",
      message: `确认删除成果「${entry?.title || "当前成果"}」吗？删除后会同时清除该成果目录。`,
      confirmLabel: "确认删除成果",
      error: "",
      action: async () => {
        await api.deleteHistory(historyId);
        await reloadCurrentWorkspace();
      },
    });
  }

  function openDownloadWorkspaceSkillConfirm() {
    if (!currentWorkspace) return;
    const workspaceId = currentWorkspace.rawId || currentWorkspace.id;
    setConfirmState({
      open: true,
      title: "用你的 Agent 管理工作空间",
      message: `将下载一整套用于管理「${currentWorkspace.name}」工作空间的 skills。你可以交给自己的 Agent 使用，让它理解并管理这个空间、任务、知识库和相关工作流。`,
      confirmLabel: "下载管理 Skills",
      confirmTone: "primary",
      error: "",
      action: async () => {
        window.location.href = api.getWorkspaceSkillUrl(workspaceId);
      },
    });
  }

  function openDownloadItemSkillConfirm() {
    if (!currentItem) return;
    setConfirmState({
      open: true,
      title: "让 Agent 处理任务",
      message: `将下载任务「${currentItem.title}」对应的 skill。你可以交给自己的 Agent 使用，让它围绕该任务的目标、要求和交付物开展工作。`,
      confirmLabel: "下载任务 Skill",
      confirmTone: "primary",
      error: "",
      action: async () => {
        window.location.href = api.getItemSkillUrl(currentItem.id);
      },
    });
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

  function openDeleteItemConfirm() {
    if (!currentItem) return;
    setConfirmState({
      open: true,
      title: "删除任务",
      message: `确认删除任务「${currentItem.title}」吗？该任务的历史记录、中间表和资源锚点会一起清除。`,
      confirmLabel: "确认删除任务",
      error: "",
      action: async () => {
        await api.deleteItem(currentItem.id);
        const nextWorkspace = await reloadCurrentWorkspace();
        setViewState((prev) => ({
          ...prev,
          selectedItemId: nextWorkspace?.items[0]?.id || null,
        }));
      },
    });
  }

  function openDeleteAgentConfirm(agentId, agentName) {
    if (!currentWorkspace?.rawId) return;
    setConfirmState({
      open: true,
      title: "删除 workAgent",
      message: `确认删除 workAgent「${agentName}」吗？该 agent 与任务的绑定关系会一并清除。`,
      confirmLabel: "确认删除",
      error: "",
      action: async () => {
        await api.deleteAgent(currentWorkspace.rawId, agentId);
        const nextWorkspace = await reloadCurrentWorkspace();
        setViewState((prev) => ({
          ...prev,
          viewId: "ws_dashboard",
          selectedAgentId: null,
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
        const nextWorkspace = await reloadCurrentWorkspace();
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
      message: `确认删除工作空间「${currentWorkspace.name}」吗？该空间下的任务、成果、知识库绑定都会被清除。`,
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
                  viewId: "ws_chat_hub",
                  wsId: fallbackWorkspace.id,
                  selectedAgentId: fallbackWorkspace.agents[0]?.id || null,
                  selectedItemId: fallbackWorkspace.items[0]?.id || null,
                  selectedKnowledgeId: fallbackWorkspace.knowledge[0]?.id || null,
                  chatHubAgentId: null,
                }
              : defaultViewState,
          );
          return nextWorkspaces;
        });
      },
    });
  }

  function handleDeleteSession() {
    // 外部智能体在 ChatHubPage 内部管理会话，不走这里；Dashboard 也不走
    if (viewState.viewId === "global_stats") return;
    if (viewState.viewId === "ws_chat_hub" && (viewState.chatHubAgentId === "__openclaw__" || viewState.chatHubAgentId === "__hermes__")) {
      return;
    }

    const currentChat =
      viewState.viewId === "global"
        ? mossChat
        : viewState.viewId === "ws_pm" ||
          (viewState.viewId === "ws_chat_hub" && !viewState.chatHubAgentId)
        ? superAgentChat
        : viewState.viewId === "ws_agents" ||
          (viewState.viewId === "ws_chat_hub" && viewState.chatHubAgentId)
        ? workAgentChat
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

  function openReviewModal(historyId) {
    const entry = currentItem?.submissions.find((candidate) => candidate.id === historyId) || null;
    setReviewTarget(entry);
    setReviewNote("");
    setReviewError("");
    setReviewModalOpen(true);
  }

  async function submitReview(status) {
    if (!reviewTarget) return;
    try {
      await api.reviewHistory(reviewTarget.id, {
        status: status === "passed" ? "completed" : "rejected",
        superagent_review_status: status,
        superagent_review_note: reviewNote.trim() || (status === "passed" ? "审批通过" : "审批驳回"),
      });
      await reloadCurrentWorkspace();
      setReviewModalOpen(false);
      setReviewTarget(null);
      setReviewNote("");
      setReviewError("");
    } catch (error) {
      setReviewError(error.message || "审批失败");
    }
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
    const noWorkspaceLoading = ["other_agent_hub", "hermes", "openclaw"];
    if (loading && !noWorkspaceLoading.includes(viewState.viewId)) {
      return <div className="view-empty">正在加载工作空间数据...</div>;
    }

    if (viewState.viewId === "other_agent_hub") {
      return (
        <OtherAgentDashboardPage
          hermesAgent={hermesAgent}
          hermesJobsCount={hermesJobs.length}
          hermesSkillsCount={hermesSkills.length}
          hermesToolsetsCount={Array.isArray(hermesToolsets) ? hermesToolsets.filter((t) => t.enabled).length : 0}
          onOpenHermesManage={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('manage', 'hermes');
            window.open(url.toString(), '_blank');
          }}
          onOpenOpenClawManage={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('manage', 'openclaw');
            window.open(url.toString(), '_blank');
          }}
          onRefreshHermes={loadHermesData}
        />
      );
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

    if (viewState.viewId === "openclaw") {
      return <OpenClawPage subNav={openclawSubNav} />;
    }

    if (viewState.viewId === "global_stats") {
      return (
        <GlobalStatsPage
          workspaceCount={globalStats.workspaceCount}
          itemCount={globalStats.itemCount}
          submissionCount={globalStats.submissionCount}
          knowledgeCount={globalStats.knowledgeCount}
          superAgentCount={globalStats.superAgentCount}
          workAgentCount={globalStats.workAgentCount}
          hermesConnected={globalStats.hermesConnected}
          openclawConnected={globalStats.openclawConnected}
          onNavigateToHistory={({ kind, targetId, jobId }) => {
            if (kind === "moss") {
              openCronHistory(kind, targetId, { defaultJobId: jobId });
            } else if (kind === "workspace_superagent") {
              window.open(`/?manage=workspace&wsId=${targetId}&view=cron_history&defaultJobId=${jobId}`, "_blank");
            } else if (kind === "workagent") {
              const ws = workspaces.find((w) => (w.agents || []).some((a) => String(a.id) === String(targetId)));
              const wsId = ws?.rawId || ws?.id || targetId;
              window.open(`/?manage=workspace&wsId=${wsId}&view=cron_history&agentId=${targetId}&defaultJobId=${jobId}`, "_blank");
            }
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

    if (viewState.viewId === "ws_dashboard") {
      return (
        <DashboardPage
          workspace={currentWorkspace}
          onDeleteWorkspace={openDeleteWorkspaceConfirm}
          onDownloadWorkspaceSkill={openDownloadWorkspaceSkillConfirm}
          onOpenResults={() => navigateTo("standalone_results")}
          onUpdateWorkspace={reloadCurrentWorkspace}
          showDeleteWorkspace={viewState.dashboardOrigin === "workspace_list"}
          onOpenManage={isManageWindow ? undefined : () => {
            const url = new URL(window.location.href);
            url.searchParams.set('manage', 'workspace');
            url.searchParams.set('wsId', currentWorkspace.id);
            window.open(url.toString(), '_blank');
          }}
        />
      );
    }

    if (viewState.viewId === "ws_office") {
      const officeActions = {
        onOpenItem: openItem,
        onOpenKnowledge: openKnowledge,
        onOpenPM: openPM,
        onOpenAgent: openAgent,
        onOpenDashboard: openDashboard,
        onCreateItem: () => setItemModalOpen(true),
        onCreateKnowledge: () => setKnowledgeModalOpen(true),
        onCreateAgent: () => setAgentModalOpen(true),
        onOpenMossChatInNewTab: () => {
          window.open("/?view=global", "_blank");
        },
        onOpenWorkspaceSettings: () => setWorkspaceSettingsModalOpen(true),
        onOpenWorkspaceEdit: () => {
          if (!currentWorkspace) return;
          setWorkspaceModalMode("edit");
          setWorkspaceForm({
            name: currentWorkspace.name || "",
            super_agent_nick_name: currentWorkspace.superAgentName || "项目经理",
            goal: currentWorkspace.goal === "待补充工作总目标" ? "" : currentWorkspace.goal || "",
          });
          setWorkspaceFormError("");
          setWorkspaceModalOpen(true);
        },
      };
      const statuses = {
        pm: {
          status: superAgentChat.status,
          lastCompletedAt: superAgentChat.lastCompletedAt,
          lastSeenAt: seenSuperAgentCompletionByWorkspaceId[currentWorkspace.id] || 0,
        },
        workAgentStatuses: workAgentChat.statusesByAgentId || {},
        workAgentCompletions: workAgentChat.completionByAgentId || {},
        workAgentSeenCompletions: seenWorkAgentCompletionById,
      };
      const focusTarget =
        viewState.viewId === "ws_chat_hub"
          ? viewState.chatHubAgentId || "pm"
          : viewState.viewId === "ws_pm"
          ? "pm"
          : viewState.viewId === "ws_agents"
          ? viewState.selectedAgentId
          : null;
      return (
        <OfficePage
          workspace={currentWorkspace}
          currentUserName={displayName}
          actions={{ ...officeActions, ...getOfficeSelectionState({ officeFocusTarget: focusTarget }) }}
          agentStatuses={statuses}
        />
      );
    }

    if (viewState.viewId === "ws_pm") {
      return (
        <PMPage
          messages={activeRuntimeChat.messages}
          superAgentName={currentWorkspace.superAgentName}
          workspaceId={currentWorkspace.id}
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
          dropUploadContext={{ kind: "workspace_superagent", workspaceId: currentWorkspace.id }}
        />
      );
    }

    if (viewState.viewId === "ws_agents") {
      return (
        <AgentPage
          agentName={selectedAgent?.name}
          agentId={selectedAgent?.id}
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
          dropUploadContext={{ kind: "workagent", agentId: selectedAgent?.id }}
        />
      );
    }

    if (viewState.viewId === "ws_chat_hub") {
      return (
        <ChatHubPage
          workspace={currentWorkspace}
          chatHubAgentId={viewState.chatHubAgentId}
          externalAgents={externalAgents}
          onSelectAgent={(agentId) =>
            setViewState((prev) => ({ ...prev, chatHubAgentId: agentId }))
          }
          onCheckExternalAgent={handleCheckExternalAgent}
          onOpenCreateAgent={() => {
            setAgentForm(defaultAgentForm);
            setAgentFormError("");
            setAgentModalOpen(true);
          }}
          onDeleteAgent={openDeleteAgentConfirm}
          showSuperAgentChatBadge={Boolean(
            currentWorkspace && superAgentChatBadgeByWorkspaceId[currentWorkspace.id]
          )}
          workAgentChatBadgeById={workAgentChatBadgeById}
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
            !viewState.chatHubAgentId
              ? { kind: "workspace_superagent", workspaceId: currentWorkspace.id }
              : { kind: "workagent", agentId: viewState.chatHubAgentId }
          }
        />
      );
    }

    if (viewState.viewId === "ws_items") {
      return (
        <ItemPage
          currentPage={itemHistoryPage}
          item={currentItem}
          onApproveHistory={openReviewModal}
          onChangePage={(delta) =>
            setItemHistoryPage((prev) => {
              const totalPages = Math.max(1, Math.ceil(((currentItem?.submissions || []).length || 0) / 10));
              return Math.min(totalPages, Math.max(1, prev + delta));
            })
          }
          onDeleteHistory={openDeleteHistoryConfirm}
          onDeleteItem={openDeleteItemConfirm}
          onDownloadItemSkill={openDownloadItemSkillConfirm}
          onOpenBasics={openItemBasicsModal}
          onOpenResultDetail={(historyId) => setSelectedResultId(historyId)}
          onOpenSubmitResult={openSubmitResultModal}
          onRefresh={reloadCurrentWorkspace}
          onSetAgent={() => {
            setBindAgentError("");
            setBindAgentModalOpen(true);
          }}
          onUnsetAgent={openUnbindAgentConfirm}
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

    if (viewState.viewId === "standalone_results") {
      return (
        <ResultsPage
          workspace={currentWorkspace}
          onBack={() => navigateTo("ws_dashboard")}
          onOpenResultDetail={(historyId) => setSelectedResultId(historyId)}
        />
      );
    }

    if (viewState.viewId === "cron_history" && cronHistoryContext) {
      return (
        <CronHistoryPage
          kind={cronHistoryContext.kind}
          targetId={cronHistoryContext.targetId}
          agentName={getHeaderTitleForCronHistory()}
          defaultJobId={cronHistoryContext.defaultJobId}
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
              onOpenGlobal={openGlobal}
              onOpenGlobalStats={openGlobalStats}
              onOpenWorkspace={openWorkspace}
              onRefreshWorkspaces={handleRefreshWorkspaces}
              onToggleUserPanel={() => setUserPanelOpen((prev) => !prev)}
              onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
              onOpenOtherAgentHub={openOtherAgentHub}
              workspaces={workspaces}
            />
          )}

          {(isManageWindow || viewState.viewId === "global_stats" || viewState.viewId === "hermes" || viewState.viewId === "openclaw" || viewState.viewId === "cron_history" || viewState.viewId.startsWith("ws_") || viewState.viewId === "other_agent_hub") ? null : (
            <Sidebar
              currentWorkspace={currentWorkspace}
              isRefreshingItems={isRefreshingItems}
              isRefreshingKnowledge={isRefreshingKnowledge}
              selectedItemId={viewState.selectedItemId}
              selectedKnowledgeId={viewState.selectedKnowledgeId}
              viewId={viewState.viewId}
              chatHubBadge={Boolean(currentWorkspace && workspaceChatBadgeByWorkspaceId[currentWorkspace.id])}
              chatHubAgentId={viewState.chatHubAgentId}
              externalAgents={externalAgents}
              showSuperAgentChatBadge={Boolean(
                currentWorkspace && superAgentChatBadgeByWorkspaceId[currentWorkspace.id]
              )}
              workAgentChatBadgeById={workAgentChatBadgeById}
              onOpenChatHub={openChatHub}
              onOpenPM={openPM}
              onOpenAgent={openAgent}
              onOpenCreateAgent={() => {
                setAgentForm(defaultAgentForm);
                setAgentFormError("");
                setAgentModalOpen(true);
              }}
              onDeleteAgent={openDeleteAgentConfirm}
              onCheckExternalAgent={handleCheckExternalAgent}
              onOpenCreateItem={() => {
                setItemForm(defaultItemForm);
                setItemFormError("");
                setItemModalOpen(true);
              }}
              onOpenCreateKnowledge={() => {
                setKnowledgeForm(defaultKnowledgeForm);
                setKnowledgeFormError("");
                setKnowledgeModalOpen(true);
              }}
              onOpenDashboard={openDashboard}
              onOpenOffice={openOffice}
              onOpenItem={openItem}
              onOpenKnowledge={openKnowledge}
              onRefreshItems={handleRefreshItems}
              onRefreshKnowledge={handleRefreshKnowledge}
            />
          )}

          <main className="app-main">
            {(() => {
              if (viewState.viewId === "home") return null;
              const agentContext =
                viewState.viewId === "global"
                  ? { kind: "moss", refId: null }
                  : viewState.viewId === "ws_pm" && viewState.wsId
                  ? { kind: "superagent", refId: viewState.wsId }
                  : viewState.viewId === "ws_agents" && selectedAgent
                  ? { kind: "workagent", refId: selectedAgent.id }
                  : viewState.viewId === "ws_chat_hub" && viewState.wsId
                  ? !viewState.chatHubAgentId
                    ? { kind: "superagent", refId: viewState.wsId }
                    : viewState.chatHubAgentId === "__openclaw__" || viewState.chatHubAgentId === "__hermes__"
                    ? { kind: null, refId: null }
                    : { kind: "workagent", refId: viewState.chatHubAgentId }
                  : viewState.viewId === "cron_history" && cronHistoryContext
                  ? { kind: cronHistoryContext.kind === "moss" ? "moss" : cronHistoryContext.kind === "workspace_superagent" ? "superagent" : "workagent", refId: cronHistoryContext.targetId }
                  : { kind: null, refId: null };
              const cronHistoryKey = agentContext.kind ? `${agentContext.kind === "superagent" ? "workspace_superagent" : agentContext.kind === "workagent" ? "workagent" : "moss"}:${agentContext.refId ?? "null"}` : null;
              const showCronHistoryEntry = cronHistoryKey ? (viewState.viewId === "cron_history" || !!cronHistoryEntryMap[cronHistoryKey]) : false;
              return (
                <Header
                  currentWorkspaceName={viewState.viewId === "global" || viewState.viewId === "global_stats" || viewState.viewId === "hermes" || viewState.viewId === "openclaw" || viewState.viewId === "other_agent_hub" || viewState.viewId === "cron_history" ? "" : currentWorkspace?.name || ""}
                  title={getHeaderTitle()}
                  icon={getHeaderIcon()}
                  showBrand={true}
                  isHome={false}
                  onOpenExternalLink={openExternalLinkConfirm}
                  onOpenSettings={() => setSettingsModalOpen(true)}
                  onDeleteSession={handleDeleteSession}
                  agentKind={agentContext.kind}
                  agentRefId={agentContext.refId}
                  showCronHistoryEntry={showCronHistoryEntry}
                  onOpenCronHistory={() => {
                    const kind = agentContext.kind === "moss" ? "moss" : agentContext.kind === "superagent" ? "workspace_superagent" : "workagent";
                    openCronHistory(kind, agentContext.refId ? Number(agentContext.refId) : null);
                  }}
                  onCronMutated={refreshCronHistoryEntry}
                  isInCronHistory={viewState.viewId === "cron_history"}
                  onBackToChat={() => {
                    if (!cronHistoryContext) return;
                    if (cronHistoryContext.kind === "moss") {
                      openGlobal();
                    } else if (cronHistoryContext.kind === "workspace_superagent") {
                      openChatHub();
                    } else if (cronHistoryContext.kind === "workagent") {
                      setViewState((prev) => ({
                        ...prev,
                        viewId: "ws_chat_hub",
                        chatHubAgentId: String(cronHistoryContext.targetId),
                      }));
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
                  onOpenHermes={openHermes}
                  onOpenOpenClaw={openOpenClaw}
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
            ) : viewState.viewId.startsWith("ws_") && (isManageWindow || viewState.viewId !== "ws_dashboard") ? (
              <div className="app-main-body">
                <Sidebar
                  hideHeader
                  currentWorkspace={currentWorkspace}
                  isRefreshingItems={isRefreshingItems}
                  isRefreshingKnowledge={isRefreshingKnowledge}
                  selectedItemId={viewState.selectedItemId}
                  selectedKnowledgeId={viewState.selectedKnowledgeId}
                  viewId={viewState.viewId}
                  chatHubBadge={Boolean(currentWorkspace && workspaceChatBadgeByWorkspaceId[currentWorkspace.id])}
                  chatHubAgentId={viewState.chatHubAgentId}
                  externalAgents={externalAgents}
                  showSuperAgentChatBadge={Boolean(
                    currentWorkspace && superAgentChatBadgeByWorkspaceId[currentWorkspace.id]
                  )}
                  workAgentChatBadgeById={workAgentChatBadgeById}
                  onOpenChatHub={openChatHub}
                  onOpenPM={openPM}
                  onOpenAgent={openAgent}
                  onOpenCreateAgent={() => {
                    setAgentForm(defaultAgentForm);
                    setAgentFormError("");
                    setAgentModalOpen(true);
                  }}
                  onDeleteAgent={openDeleteAgentConfirm}
                  onCheckExternalAgent={handleCheckExternalAgent}
                  onOpenCreateItem={() => {
                    setItemForm(defaultItemForm);
                    setItemFormError("");
                    setItemModalOpen(true);
                  }}
                  onOpenCreateKnowledge={() => {
                    setKnowledgeForm(defaultKnowledgeForm);
                    setKnowledgeFormError("");
                    setKnowledgeModalOpen(true);
                  }}
                  onOpenDashboard={openDashboard}
                  onOpenOffice={openOffice}
                  onOpenItem={openItem}
                  onOpenKnowledge={openKnowledge}
                  onRefreshItems={handleRefreshItems}
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
            onSubmit={workspaceModalMode === "edit" ? handleUpdateWorkspace : handleCreateWorkspace}
          />

          <CreateItemModal
            open={itemModalOpen}
            form={itemForm}
            error={itemFormError}
            onClose={() => {
              setItemModalOpen(false);
              setItemFormError("");
            }}
            onChange={handleItemField}
            onSubmit={handleCreateItem}
          />

          <CreateAgentModal
            open={agentModalOpen}
            form={agentForm}
            error={agentFormError}
            onClose={() => {
              setAgentModalOpen(false);
              setAgentFormError("");
            }}
            onChange={handleAgentField}
            onSubmit={handleCreateAgent}
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

          <SubmitResultModal
            open={submitResultModalOpen}
            form={submitResultForm}
            error={submitResultError}
            onChange={updateSubmitResultField}
            onClose={() => setSubmitResultModalOpen(false)}
            onFileChange={(event) =>
              setSubmitResultForm((prev) => ({
                ...prev,
                files: Array.from(event.target.files || []),
              }))
            }
            onSubmit={submitCurrentItemResult}
          />

          <ResultDetailModal
            downloadUrlBuilder={api.getHistoryDownloadUrl}
            entry={selectedResultEntry}
            fileUrlBuilder={api.getHistoryPreviewUrl}
            open={Boolean(selectedResultId)}
            previewUrlBuilder={api.getHistoryPreviewUrl}
            onClose={() => setSelectedResultId(null)}
          />

          {bindAgentModalOpen && (
            <div className="modal-overlay" onClick={() => setBindAgentModalOpen(false)}>
              <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <h3>设定 workAgent</h3>
                    <p>为当前任务绑定一个执行智能体。</p>
                  </div>
                  <button className="close-btn" type="button" onClick={() => setBindAgentModalOpen(false)}>
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  {currentWorkspace?.agents?.length === 0 ? (
                    <div style={{ color: "var(--tx-muted)", padding: "20px 0" }}>
                      当前工作空间还没有 workAgent，请先创建一个。
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {currentWorkspace?.agents?.map((agent) => (
                        <button
                          key={agent.id}
                          className="sidebar-menu-item plain-btn"
                          type="button"
                          onClick={() => openBindAgentConfirm(agent.id, agent.name)}
                          style={{ textAlign: "left" }}
                        >
                          <span className="menu-icon">🤖</span>
                          <span>{agent.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {bindAgentError ? <div className="modal-inline-error">{bindAgentError}</div> : null}
                </div>
                <div className="modal-footer">
                  <button className="secondary-btn" type="button" onClick={() => setBindAgentModalOpen(false)}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          <ItemBasicsModal
            error={itemBasicsError}
            form={itemBasicsForm}
            onChange={handleItemBasicsField}
            onClose={() => setItemBasicsOpen(false)}
            onSubmit={saveItemBasics}
            open={itemBasicsOpen}
          />

          <ReviewHistoryModal
            error={reviewError}
            note={reviewNote}
            onChangeNote={setReviewNote}
            onClose={() => {
              setReviewModalOpen(false);
              setReviewTarget(null);
              setReviewNote("");
              setReviewError("");
            }}
            onPass={() => submitReview("passed")}
            onReject={() => submitReview("rejected")}
            open={reviewModalOpen}
            title={reviewTarget?.title || ""}
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
