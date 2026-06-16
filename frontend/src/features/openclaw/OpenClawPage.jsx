import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { openclawApi } from "./openclawApi";
import { openclawGateway } from "./openclawGateway";
import { useOpenClawChat } from "./useOpenClawChat";
import { useOpenClawData } from "./useOpenClawData";
import { useOpenClawCron } from "./useOpenClawCron";
import { OverviewTab } from "./OverviewTab";
import { OpenClawChatSurface } from "./OpenClawChatSurface";
import "./openclaw.css";

export function OpenClawPage({ subNav = "overview" }) {
  const [connectionState, setConnectionState] = useState(openclawGateway.state);
  const [pageError, setPageError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const chat = useOpenClawChat();
  const data = useOpenClawData();
  const cron = useOpenClawCron();

  // 监听 Gateway 连接状态
  useEffect(() => {
    let mounted = true;
    const unsubscribe = openclawGateway.subscribeState((state) => {
      if (!mounted) return;
      setConnectionState(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // 连接成功后自动加载数据（仅首次 connected 时触发）
  const dataLoadedRef = useRef(false);
  useEffect(() => {
    if (connectionState !== "connected" || dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    Promise.all([
      data.loadAll(),
      cron.loadJobs(),
    ]).catch((err) => {
      console.error("[OpenClawPage] 数据加载失败:", err);
      setPageError(`加载失败: ${err.message}`);
      setTimeout(() => setPageError(""), 5000);
    });
  }, [connectionState]);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      if (connectionState === "connected") {
        await Promise.all([
          chat.loadSessions(),
          data.loadAll(),
          cron.loadJobs(),
        ]);
      } else {
        // 尝试重连
        const config = await openclawApi.getConfig();
        openclawGateway.disconnect();
        await openclawGateway.connect(config.proxyUrl || config.gatewayUrl);
      }
    } catch (err) {
      setPageError(`刷新失败: ${err.message}`);
      setTimeout(() => setPageError(""), 5000);
    } finally {
      setIsRefreshing(false);
    }
  }

  const isOnline = connectionState === "connected";

  // 加载中
  if (connectionState === "connecting") {
    return (
      <div className="openclaw-page openclaw-loading">
        <div className="openclaw-spinner"></div>
        <p>正在连接 OpenClaw Gateway...</p>
      </div>
    );
  }

  return (
    <div className="openclaw-page">
      {pageError && <div className="openclaw-error-bar">{pageError}</div>}

      {/* Topbar */}
      <div className="openclaw-header">
        <div className="openclaw-topbar-left">
          <span className={`openclaw-status ${isOnline ? "online" : "offline"}`}>
            {isOnline ? "● 在线" : "● 离线"}
          </span>
        </div>
        <div className="openclaw-topbar-actions">
          <button
            className="openclaw-action-btn-sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="刷新"
          >
            <RefreshCw size={16} className={isRefreshing ? "spin" : ""} />
            <span>{isRefreshing ? "刷新中..." : "刷新"}</span>
          </button>

        </div>
      </div>

      {/* 内容区 */}
      <div className="openclaw-content">
        {!isOnline ? (
          <div className="openclaw-empty-state">
            <div className="openclaw-empty-icon">🔗</div>
            <h3>OpenClaw 未连接</h3>
            <p>无法连接到 OpenClaw Gateway，请检查服务是否启动。</p>
          </div>
        ) : (
          <>
            {subNav === "overview" && <OverviewTab data={data} cron={cron} />}
            {subNav === "chat" && <OpenClawChatSurface chat={chat} />}
    
          </>
        )}
      </div>

    </div>
  );
}
