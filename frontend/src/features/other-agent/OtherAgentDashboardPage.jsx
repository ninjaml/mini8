import { useEffect, useMemo, useState } from "react";
import { Bot, Zap, MessageSquare, ExternalLink, Eye, EyeOff, RefreshCw } from "lucide-react";
import { hermesApi } from "../hermes/hermesApi";
import { openclawApi } from "../openclaw/openclawApi";
import { openclawGateway } from "../openclaw/openclawGateway";
import { openclawConfigApi } from "../openclaw/openclawConfigApi";
import { buildHermesConfigValues } from "../external-agents/configStatus";

export function OtherAgentDashboardPage({
  hermesAgent,
  onOpenHermesManage,
  onOpenOpenClawManage,
  onRefreshHermes,
}) {
  // ─── Hermes ───
  const [hermesConfig, setHermesConfig] = useState(null);
  const [hermesConfigLoading, setHermesConfigLoading] = useState(true);
  const [hermesEditing, setHermesEditing] = useState({ apiBaseUrl: "", apiKey: "", dashboardUrl: "" });
  const [showHermesKey, setShowHermesKey] = useState(false);
  const [savingHermes, setSavingHermes] = useState(false);
  const [refreshingHermes, setRefreshingHermes] = useState(false);

  // ─── OpenClaw ───
  const [openclawState, setOpenclawState] = useState(openclawGateway.state);
  const [openclawConfig, setOpenclawConfig] = useState(null);
  const [openclawConfigLoading, setOpenclawConfigLoading] = useState(true);
  const [openclawEditing, setOpenclawEditing] = useState({ gatewayUrl: "", gatewayToken: "" });
  const [showOpenClawToken, setShowOpenClawToken] = useState(false);
  const [savingOpenClaw, setSavingOpenClaw] = useState(false);
  const [refreshingOpenClaw, setRefreshingOpenClaw] = useState(false);

  useEffect(() => {
    let mounted = true;

    hermesApi
      .getConfigs()
      .then((configs) => {
        if (!mounted) return;
        const cfg = buildHermesConfigValues(configs);
        setHermesConfig(cfg);
        setHermesEditing({ apiBaseUrl: cfg.apiBaseUrl, apiKey: cfg.apiKey, dashboardUrl: cfg.dashboardUrl });
      })
      .catch(() => { if (mounted) setHermesConfig(null); })
      .finally(() => { if (mounted) setHermesConfigLoading(false); })
      .then(() => {
        // 自动检查 Hermes 连接
        if (!mounted) return;
        if (onRefreshHermes) {
          onRefreshHermes().catch(() => {});
        }
      });

    const unsubscribe = openclawGateway.subscribeState((state) => {
      if (!mounted) return;
      setOpenclawState(state);
    });

    openclawConfigApi
      .getConfigs()
      .then((configs) => {
        if (!mounted) return;
        const find = (key) => configs.find((c) => c.key === key)?.value || "";
        const cfg = { gatewayUrl: find("gateway_url"), gatewayToken: find("gateway_token") };
        setOpenclawConfig(cfg);
        setOpenclawEditing(cfg);
      })
      .catch(() => { if (mounted) setOpenclawConfig(null); })
      .finally(() => { if (mounted) setOpenclawConfigLoading(false); });

    return () => {
      mounted = false;
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHermesConfigured = !!hermesConfig?.apiBaseUrl;
  const isHermesConnected = hermesAgent?.status === "online";

  // 连接状态只分两种：在线 / 离线
  const isOpenClawConnected = openclawState === "connected";

  const isOpenClawConfigured = !!openclawConfig?.gatewayUrl;

  // OpenClaw Dashboard URL: replace ws:// with http://
  const openclawDashboardUrl = openclawEditing.gatewayUrl
    ? openclawEditing.gatewayUrl.replace(/^ws:\/\//i, "http://").replace(/^wss:\/\//i, "https://")
    : "";

  async function handleRefreshHermes() {
    if (onRefreshHermes) await onRefreshHermes();
    try {
      const configs = await hermesApi.getConfigs();
      const cfg = buildHermesConfigValues(configs);
      setHermesConfig(cfg);
      setHermesEditing({ apiBaseUrl: cfg.apiBaseUrl, apiKey: cfg.apiKey, dashboardUrl: cfg.dashboardUrl });
    } catch {
      // ignore
    }
  }

  async function doRefreshHermes() {
    setRefreshingHermes(true);
    try {
      await handleRefreshHermes();
    } finally {
      setRefreshingHermes(false);
    }
  }

  async function doRefreshOpenClaw() {
    setRefreshingOpenClaw(true);
    try {
      // 刷新配置
      const configs = await openclawConfigApi.getConfigs();
      const find = (key) => configs.find((c) => c.key === key)?.value || "";
      const cfg = { gatewayUrl: find("gateway_url"), gatewayToken: find("gateway_token") };
      setOpenclawConfig(cfg);
      setOpenclawEditing(cfg);

      // 尝试连接
      const apiConfig = await openclawApi.getConfig();
      if (apiConfig.proxyUrl || apiConfig.gatewayUrl) {
        await openclawGateway.connect(apiConfig.proxyUrl || apiConfig.gatewayUrl);
      }
    } catch {
      // ignore
    } finally {
      setRefreshingOpenClaw(false);
    }
  }

  async function saveHermesConfig() {
    setSavingHermes(true);
    try {
      await Promise.all([
        hermesApi.updateConfig("api_base_url", hermesEditing.apiBaseUrl),
        hermesApi.updateConfig("api_key", hermesEditing.apiKey),
        hermesApi.updateConfig("dashboard_url", hermesEditing.dashboardUrl),
      ]);
      await handleRefreshHermes();
    } catch (err) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setSavingHermes(false);
    }
  }

  async function saveOpenClawConfig() {
    setSavingOpenClaw(true);
    try {
      await Promise.all([
        openclawConfigApi.updateConfig("gateway_url", openclawEditing.gatewayUrl, "OpenClaw Gateway WebSocket 地址"),
        openclawConfigApi.updateConfig("gateway_token", openclawEditing.gatewayToken, "OpenClaw Gateway 认证 Token"),
      ]);
      const configs = await openclawConfigApi.getConfigs();
      const find = (key) => configs.find((c) => c.key === key)?.value || "";
      const cfg = { gatewayUrl: find("gateway_url"), gatewayToken: find("gateway_token") };
      setOpenclawConfig(cfg);
      setOpenclawEditing(cfg);

      // 保存后自动尝试连接
      if (cfg.gatewayUrl) {
        try {
          const apiConfig = await openclawApi.getConfig();
          await openclawGateway.connect(apiConfig.proxyUrl || apiConfig.gatewayUrl);
        } catch {
          // 连接失败静默处理，状态通过 gateway subscribe 更新
        }
      }
    } catch (err) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setSavingOpenClaw(false);
    }
  }


  return (
    <section id="view-other-agent-hub" className="view-container">
      <div className="page-head">
        <div>
          <h2>连接智能体</h2>
          <p>管理你的外部智能体连接与任务调度。</p>
        </div>
      </div>

      <div className="dashboard-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 24, alignItems: "stretch", marginLeft: 0, marginRight: 0 }}>
        {/* Hermes */}
        <div className="dash-card" style={{ display: "flex", flexDirection: "column", minHeight: 400 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#059669", display: "flex" }}><Bot size={22} /></span>
              <span className="card-title" style={{ margin: 0 }}>Hermes</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={doRefreshHermes}
                disabled={refreshingHermes}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 2, display: "flex", alignItems: "center" }}
                title="刷新状态"
              >
                <RefreshCw size={14} style={{ animation: refreshingHermes ? "spin 1s linear infinite" : "none" }} />
              </button>
              <span className={`item-badge ${isHermesConfigured ? "green" : "gray"}`}>
                {isHermesConfigured ? "已配置" : "未配置"}
              </span>
              {isHermesConfigured && (
                <span className={`item-badge ${isHermesConnected ? "green" : "red"}`}>
                  {isHermesConnected ? "在线" : "离线"}
                </span>
              )}
            </div>
          </div>

          {hermesConfigLoading ? (
            <div style={{ color: "#9ca3af", fontSize: 14, padding: "24px 0", flex: 1 }}>检测配置中…</div>
          ) : (
            <>
              {/* 配置表单 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>API 地址</label>
                  <input
                    className="form-input"
                    style={{ fontSize: 13 }}
                    autoComplete="off"
                    name="hermes-api-base-url"
                    value={hermesEditing.apiBaseUrl}
                    onChange={(e) => setHermesEditing((p) => ({ ...p, apiBaseUrl: e.target.value }))}
                    placeholder="http://127.0.0.1:8642"
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>API Key</label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="form-input"
                      style={{ fontSize: 13, paddingRight: 36 }}
                      type={showHermesKey ? "text" : "password"}
                      autoComplete="new-password"
                      name="hermes-api-key"
                      value={hermesEditing.apiKey}
                      onChange={(e) => setHermesEditing((p) => ({ ...p, apiKey: e.target.value }))}
                      placeholder="留空表示无认证"
                    />
                    <button
                      type="button"
                      onClick={() => setShowHermesKey((v) => !v)}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}
                    >
                      {showHermesKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Dashboard URL</label>
                  <input
                    className="form-input"
                    style={{ fontSize: 13 }}
                    autoComplete="off"
                    name="hermes-dashboard-url"
                    value={hermesEditing.dashboardUrl}
                    onChange={(e) => setHermesEditing((p) => ({ ...p, dashboardUrl: e.target.value }))}
                    placeholder="http://127.0.0.1:9119"
                  />
                </div>
                {hermesEditing.dashboardUrl && (
                  <div style={{ fontSize: 12 }}>
                    <a href={hermesEditing.dashboardUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      打开原生 Dashboard <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>

              <div style={{ flex: 1 }} />

              {/* 按钮行 */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
                <button className="primary-btn compact" type="button" onClick={saveHermesConfig} disabled={savingHermes}>
                  {savingHermes ? "保存中..." : "保存配置"}
                </button>
                <button
                  className="plain-btn"
                  type="button"
                  onClick={onOpenHermesManage}
                  disabled={!isHermesConnected}
                  title={isHermesConnected ? "" : "Hermes 尚未联通，请检查配置"}
                >
                  <MessageSquare size={14} />
                  进入
                </button>
                <a
                  className="plain-btn"
                  href="https://ocnko0ovs8al.feishu.cn/wiki/Gj2KwDzTRiQXgPkR9ZVcQQHqnWb"
                  target="_blank"
                  rel="noreferrer"
                >
                  配置说明
                </a>
              </div>
            </>
          )}
        </div>

        {/* OpenClaw */}
        <div className="dash-card" style={{ display: "flex", flexDirection: "column", minHeight: 400 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#059669", display: "flex" }}><Zap size={22} /></span>
              <span className="card-title" style={{ margin: 0 }}>OpenClaw</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={doRefreshOpenClaw}
                disabled={refreshingOpenClaw}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 2, display: "flex", alignItems: "center" }}
                title="刷新状态"
              >
                <RefreshCw size={14} style={{ animation: refreshingOpenClaw ? "spin 1s linear infinite" : "none" }} />
              </button>
              <span className={`item-badge ${isOpenClawConfigured ? "green" : "gray"}`}>
                {isOpenClawConfigured ? "已配置" : "未配置"}
              </span>
              {isOpenClawConfigured && (
                <span className={`item-badge ${isOpenClawConnected ? "green" : "red"}`}>
                  {isOpenClawConnected ? "在线" : "离线"}
                </span>
              )}
            </div>
          </div>

          {openclawConfigLoading ? (
            <div style={{ color: "#9ca3af", fontSize: 14, padding: "24px 0", flex: 1 }}>检测配置中…</div>
          ) : (
            <>
              {/* 配置表单 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Gateway WebSocket 地址</label>
                  <input
                    className="form-input"
                    style={{ fontSize: 13 }}
                    value={openclawEditing.gatewayUrl}
                    onChange={(e) => setOpenclawEditing((p) => ({ ...p, gatewayUrl: e.target.value }))}
                    placeholder="ws://127.0.0.1:18789"
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Gateway Token</label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="form-input"
                      style={{ fontSize: 13, paddingRight: 36 }}
                      type={showOpenClawToken ? "text" : "password"}
                      value={openclawEditing.gatewayToken}
                      onChange={(e) => setOpenclawEditing((p) => ({ ...p, gatewayToken: e.target.value }))}
                      placeholder="留空表示使用默认 Token"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenClawToken((v) => !v)}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}
                    >
                      {showOpenClawToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {openclawDashboardUrl && (
                  <div style={{ fontSize: 12 }}>
                    <a href={openclawDashboardUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      打开原生 Dashboard <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>

              <div style={{ flex: 1 }} />

              {/* 按钮行 */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
                <button className="primary-btn compact" type="button" onClick={saveOpenClawConfig} disabled={savingOpenClaw}>
                  {savingOpenClaw ? "保存中..." : "保存配置"}
                </button>
                <button
                  className="plain-btn"
                  type="button"
                  onClick={onOpenOpenClawManage}
                  disabled={!isOpenClawConnected}
                  title={isOpenClawConnected ? "" : "OpenClaw 尚未联通，请检查配置"}
                >
                  <MessageSquare size={14} />
                  进入
                </button>
                <a
                  className="plain-btn"
                  href="https://ocnko0ovs8al.feishu.cn/wiki/Gj2KwDzTRiQXgPkR9ZVcQQHqnWb"
                  target="_blank"
                  rel="noreferrer"
                >
                  配置说明
                </a>
              </div>
            </>
          )}
        </div>
      </div>


    </section>
  );
}
