import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { openclawConfigApi } from "./openclawConfigApi";

export function OpenClawConfigModal({ open, onClose, onSaved }) {
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [configTab, setConfigTab] = useState("connection");
  const [editingConfig, setEditingConfig] = useState({
    gateway_url: "",
    gateway_token: "",
  });

  useEffect(() => {
    if (!open) return;
    setConfigTab("connection");
    setConfigLoading(true);
    openclawConfigApi
      .getConfigs()
      .then((configs) => {
        const find = (key, def = "") => configs.find((c) => c.key === key)?.value || def;
        setEditingConfig({
          gateway_url: find("gateway_url", "ws://127.0.0.1:18789"),
          gateway_token: find("gateway_token", ""),
        });
      })
      .catch(() => {
        setEditingConfig({
          gateway_url: "ws://127.0.0.1:18789",
          gateway_token: "",
        });
      })
      .finally(() => setConfigLoading(false));
  }, [open]);

  async function handleSave() {
    setSavingConfig(true);
    try {
      await Promise.all([
        openclawConfigApi.updateConfig("gateway_url", editingConfig.gateway_url, "OpenClaw Gateway WebSocket 地址"),
        openclawConfigApi.updateConfig("gateway_token", editingConfig.gateway_token, "OpenClaw Gateway 认证 Token"),
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
            <h3>⚙️ OpenClaw 接入配置</h3>
            <p>配置保存后请刷新页面以应用新配置</p>
          </div>
          <button className="close-btn" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {configLoading ? (
            <div className="hermes-loading">加载配置...</div>
          ) : (
            <>
              <div className="hermes-tabs">
                <button className={`hermes-tab ${configTab === "connection" ? "active" : ""}`} onClick={() => setConfigTab("connection")} type="button">连接配置</button>
                <button className={`hermes-tab ${configTab === "guide" ? "active" : ""}`} onClick={() => setConfigTab("guide")} type="button">配置指南</button>
              </div>
              <div className="hermes-tab-content">
                {configTab === "connection" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Gateway WebSocket 地址</label>
                      <input className="hermes-input" value={editingConfig.gateway_url} onChange={(e) => setEditingConfig((prev) => ({ ...prev, gateway_url: e.target.value }))} placeholder="ws://127.0.0.1:18789" />
                    </div>
                    <div>
                      <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Gateway Token</label>
                      <div className="hermes-input-wrap">
                        <input className="hermes-input" type={showToken ? "text" : "password"} value={editingConfig.gateway_token} onChange={(e) => setEditingConfig((prev) => ({ ...prev, gateway_token: e.target.value }))} placeholder="留空表示使用默认 Token" />
                        <button type="button" className="hermes-input-eye" onClick={() => setShowToken((v) => !v)} title={showToken ? "隐藏" : "显示"}>
                          {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {configTab === "guide" && (
                  <div className="hermes-guide">
                    <h4>📘 OpenClaw 配置指南</h4>
                    <h5>一、安装 OpenClaw</h5>
                    <p>确保本地已安装 OpenClaw CLI：</p>
                    <pre>{`npm install -g @openclaw/cli
# 或
pip install openclaw`}</pre>
                    <h5>二、启动 Gateway</h5>
                    <p>在终端运行以下命令启动 Gateway 服务：</p>
                    <pre>{`openclaw gateway start
# 默认监听 ws://127.0.0.1:18789`}</pre>
                    <p><strong>安全建议：</strong>bind 设置为 <code>loopback</code>（仅本机可访问）。如需局域网访问再改为 <code>all</code>：</p>
                    <pre>{`# 查看当前 bind 设置
openclaw config get gateway.bind

# 设置为 loopback（推荐，最安全）
openclaw config set gateway.bind loopback

# 或设置为 all（局域网/远程可访问，需配合强 Token + 防火墙）
openclaw config set gateway.bind all`}</pre>
                    <h5>三、获取 Token</h5>
                    <p>首次启动时，Gateway 会生成一个默认 Token。你也可以在配置文件中查看或自定义：</p>
                    <pre>{`# 查看当前配置
openclaw config get GATEWAY_TOKEN

# 设置自定义 Token
openclaw config set GATEWAY_TOKEN "your-token-here"`}</pre>
                    <h5>四、设备配对授权（关键步骤）</h5>
                    <p>后端首次连接 Gateway 时，会自动生成一个 device identity 并发起配对请求。<strong>必须在 OpenClaw CLI 中手动授权</strong>：</p>
                    <pre>{`# 1. 查看待授权设备列表
openclaw devices list

# 你会看到类似这样的输出：
# Paired (1)
#   + device-id-xxx | operator | operator.pairing
# Pending (1)
#   + device-id-yyy | operator | operator.pairing

# 2. 授权待配对设备（把 device-id-yyy 替换为实际 ID）
openclaw devices approve device-id-yyy

# 3. 确认授权成功
openclaw devices list
# 该设备应显示完整的 scopes：operator.admin, operator.read, operator.write...`}</pre>
                    <h5>五、防火墙放行（远程访问）</h5>
                    <p>如果需要从其他机器访问，请放行 18789 端口：</p>
                    <pre>{`# Windows
netsh advfirewall firewall add rule name="OpenClaw Gateway 18789" dir=in action=allow protocol=TCP localport=18789 remoteip=any enable=yes

# Linux/macOS
sudo ufw allow 18789/tcp`}</pre>
                    <h5>六、验证连接</h5>
                    <p>完成设备授权后，保存配置并刷新页面，状态栏应显示 <strong>● 在线</strong>。</p>
                    <p>如果显示离线，请检查：</p>
                    <ul>
                      <li>Gateway 是否已启动（<code>netstat -ano | findstr :18789</code>）</li>
                      <li>Token 是否正确</li>
                      <li>设备是否已授权（<code>openclaw devices list</code>）</li>
                      <li>防火墙是否放行</li>
                    </ul>
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
