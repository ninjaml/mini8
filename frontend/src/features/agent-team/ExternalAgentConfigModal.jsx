import { useEffect, useMemo, useState } from "react";
import { Bot, ExternalLink, Eye, EyeOff, RefreshCw, Zap } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { hermesApi } from "../hermes/hermesApi";
import { openclawApi } from "../openclaw/openclawApi";
import { openclawGateway } from "../openclaw/openclawGateway";
import { openclawConfigApi } from "../openclaw/openclawConfigApi";
import { buildHermesConfigValues } from "../external-agents/configStatus";

const DEFAULT_HERMES = { apiBaseUrl: "", apiKey: "", dashboardUrl: "" };
const DEFAULT_OPENCLAW = { gatewayUrl: "", gatewayToken: "" };

export function ExternalAgentConfigModal({
  open,
  agentType,
  connected,
  onClose,
  onOpenManage,
  onStatusRefresh,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [hermesForm, setHermesForm] = useState(DEFAULT_HERMES);
  const [openclawForm, setOpenclawForm] = useState(DEFAULT_OPENCLAW);
  const [openclawState, setOpenclawState] = useState(openclawGateway.state);

  useEffect(() => {
    if (!open) return undefined;
    const unsubscribe = openclawGateway.subscribeState((state) => {
      setOpenclawState(state);
    });
    return unsubscribe;
  }, [open]);

  useEffect(() => {
    if (!open || !agentType) return undefined;
    let cancelled = false;

    async function loadConfig() {
      setLoading(true);
      setError("");
      setShowSecret(false);
      try {
        if (agentType === "hermes") {
          const configs = await hermesApi.getConfigs();
          if (cancelled) return;
          setHermesForm(buildHermesConfigValues(configs));
        } else if (agentType === "openclaw") {
          const configs = await openclawConfigApi.getConfigs();
          if (cancelled) return;
          const find = (key) => configs.find((item) => item.key === key)?.value || "";
          setOpenclawForm({
            gatewayUrl: find("gateway_url"),
            gatewayToken: find("gateway_token"),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "加载配置失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [open, agentType]);

  const title = agentType === "openclaw" ? "OpenClaw 连接配置" : "Hermes 连接配置";
  const isHermes = agentType === "hermes";
  const effectiveConnected = isHermes ? connected : openclawState === "connected";
  const statusText = effectiveConnected ? "在线" : "离线";
  const statusClass = effectiveConnected ? "is-online" : "is-offline";

  const openclawDashboardUrl = useMemo(() => {
    if (!openclawForm.gatewayUrl) return "";
    return openclawForm.gatewayUrl
      .replace(/^ws:\/\//i, "http://")
      .replace(/^wss:\/\//i, "https://");
  }, [openclawForm.gatewayUrl]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (isHermes) {
        await Promise.all([
          hermesApi.updateConfig("api_base_url", hermesForm.apiBaseUrl),
          hermesApi.updateConfig("api_key", hermesForm.apiKey),
          hermesApi.updateConfig("dashboard_url", hermesForm.dashboardUrl),
        ]);
      } else {
        await Promise.all([
          openclawConfigApi.updateConfig("gateway_url", openclawForm.gatewayUrl, "OpenClaw Gateway WebSocket 地址"),
          openclawConfigApi.updateConfig("gateway_token", openclawForm.gatewayToken, "OpenClaw Gateway 认证 Token"),
        ]);
      }
      await onStatusRefresh?.(agentType);
    } catch (err) {
      setError(err.message || "保存配置失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError("");
    try {
      await onStatusRefresh?.(agentType);
      if (!isHermes) {
        const apiConfig = await openclawApi.getConfig();
        if (apiConfig.proxyUrl || apiConfig.gatewayUrl) {
          await openclawGateway.connect(apiConfig.proxyUrl || apiConfig.gatewayUrl);
        }
      }
    } catch (err) {
      setError(err.message || "刷新状态失败");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="modal-large agent-team-external-modal-shell">
      <div className="agent-team-external-modal">
        <div className="agent-team-external-modal__head">
          <div className="agent-team-external-modal__title-wrap">
            <div className={`agent-team-external-modal__avatar ${isHermes ? "" : "is-openclaw"}`}>
              {isHermes ? <Bot size={20} strokeWidth={2.1} /> : <Zap size={20} strokeWidth={2.1} />}
            </div>
            <div>
              <h3>{title}</h3>
              <p>在 Agent团队 中直接维护外部智能体的连接配置；独立管理页只承接更深入的专属操作。</p>
            </div>
          </div>
          <div className={`agent-team-card__status-pill ${statusClass}`}>{statusText}</div>
        </div>

        {loading ? <div className="view-empty">加载配置中...</div> : null}
        {!loading ? (
          <div className="agent-team-external-modal__body">
            {isHermes ? (
              <>
                <label className="form-label">API 地址</label>
                <input
                  className="form-input"
                  value={hermesForm.apiBaseUrl}
                  onChange={(event) => setHermesForm((prev) => ({ ...prev, apiBaseUrl: event.target.value }))}
                  placeholder="http://127.0.0.1:8642"
                />

                <label className="form-label">API Key</label>
                <div className="agent-team-external-modal__secret-row">
                  <input
                    className="form-input"
                    type={showSecret ? "text" : "password"}
                    value={hermesForm.apiKey}
                    onChange={(event) => setHermesForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                    placeholder="留空表示无认证"
                  />
                  <button className="plain-btn" type="button" onClick={() => setShowSecret((prev) => !prev)}>
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <label className="form-label">Dashboard URL</label>
                <input
                  className="form-input"
                  value={hermesForm.dashboardUrl}
                  onChange={(event) => setHermesForm((prev) => ({ ...prev, dashboardUrl: event.target.value }))}
                  placeholder="http://127.0.0.1:9119"
                />
              </>
            ) : (
              <>
                <label className="form-label">Gateway WebSocket 地址</label>
                <input
                  className="form-input"
                  value={openclawForm.gatewayUrl}
                  onChange={(event) => setOpenclawForm((prev) => ({ ...prev, gatewayUrl: event.target.value }))}
                  placeholder="ws://127.0.0.1:18789"
                />

                <label className="form-label">Gateway Token</label>
                <div className="agent-team-external-modal__secret-row">
                  <input
                    className="form-input"
                    type={showSecret ? "text" : "password"}
                    value={openclawForm.gatewayToken}
                    onChange={(event) => setOpenclawForm((prev) => ({ ...prev, gatewayToken: event.target.value }))}
                    placeholder="留空表示使用默认 Token"
                  />
                  <button className="plain-btn" type="button" onClick={() => setShowSecret((prev) => !prev)}>
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </>
            )}

            {error ? <div className="login-error">{error}</div> : null}

            <div className="agent-team-external-modal__footer">
              <div className="agent-team-external-modal__links">
                {isHermes && hermesForm.dashboardUrl ? (
                  <a href={hermesForm.dashboardUrl} target="_blank" rel="noreferrer" className="plain-btn">
                    <ExternalLink size={14} />
                    打开原生 Dashboard
                  </a>
                ) : null}
                {!isHermes && openclawDashboardUrl ? (
                  <a href={openclawDashboardUrl} target="_blank" rel="noreferrer" className="plain-btn">
                    <ExternalLink size={14} />
                    打开原生 Dashboard
                  </a>
                ) : null}
              </div>
              <div className="agent-team-external-modal__actions">
                <button className="plain-btn" type="button" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw size={14} className={refreshing ? "is-spinning" : ""} />
                  {refreshing ? "刷新中" : "刷新状态"}
                </button>
                <button className="plain-btn" type="button" onClick={onOpenManage}>
                  <ExternalLink size={14} />
                  打开管理页
                </button>
                <button className="primary-btn compact" type="button" onClick={handleSave} disabled={saving}>
                  {saving ? "保存中..." : "保存配置"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
