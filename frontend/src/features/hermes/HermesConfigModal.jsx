import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { hermesApi } from "./hermesApi";

export function HermesConfigModal({ open, onClose, onSaved }) {
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [configTab, setConfigTab] = useState("connection");
  const [editingConfig, setEditingConfig] = useState({
    api_base_url: "",
    api_key: "",
    dashboard_url: "",
    home_dir: "",
    skills_dir: "",
    cron_jobs_path: "",
    config_path: "",
  });

  useEffect(() => {
    if (!open) return;
    setConfigTab("connection");
    setConfigLoading(true);
    hermesApi
      .getConfigs()
      .then((configs) => {
        const find = (key, def = "") => configs.find((c) => c.key === key)?.value || def;
        setEditingConfig({
          api_base_url: find("api_base_url", "http://127.0.0.1:8642"),
          api_key: find("api_key", ""),
          dashboard_url: find("dashboard_url", "http://127.0.0.1:9119"),
          home_dir: find("home_dir", "~/.hermes"),
          skills_dir: find("skills_dir", "~/.hermes/skills"),
          cron_jobs_path: find("cron_jobs_path", "~/.hermes/cron/jobs.json"),
          config_path: find("config_path", "~/.hermes/config.yaml"),
        });
      })
      .catch(() => {
        setEditingConfig({
          api_base_url: "http://127.0.0.1:8642",
          api_key: "",
          dashboard_url: "http://127.0.0.1:9119",
          home_dir: "~/.hermes",
          skills_dir: "~/.hermes/skills",
          cron_jobs_path: "~/.hermes/cron/jobs.json",
          config_path: "~/.hermes/config.yaml",
        });
      })
      .finally(() => setConfigLoading(false));
  }, [open]);

  async function handleSave() {
    setSavingConfig(true);
    try {
      await Promise.all([
        hermesApi.updateConfig("api_base_url", editingConfig.api_base_url),
        hermesApi.updateConfig("api_key", editingConfig.api_key),
        hermesApi.updateConfig("dashboard_url", editingConfig.dashboard_url),
        hermesApi.updateConfig("home_dir", editingConfig.home_dir),
        hermesApi.updateConfig("skills_dir", editingConfig.skills_dir),
        hermesApi.updateConfig("cron_jobs_path", editingConfig.cron_jobs_path),
        hermesApi.updateConfig("config_path", editingConfig.config_path),
      ]);
      onClose();
      onSaved && onSaved();
    } catch (err) {
      alert(`保存配置失败: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-box ${configTab === "guide" ? "modal-box-wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>⚙️ Hermes 接入配置</h3>
            <p>配置包保存即可生效（hermes ≥ v0.14）</p>
          </div>
          <button className="close-btn" type="button" onClick={onClose}>×</button>
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
          <button className="secondary-btn" type="button" onClick={onClose}>关闭</button>
          {configTab !== "guide" && (
            <button className="primary-btn" type="button" onClick={handleSave} disabled={savingConfig || configLoading}>
              {savingConfig ? "保存中..." : "保存"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
