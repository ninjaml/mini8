/**
 * OpenClaw Gateway WebSocket 客户端（后端代理模式）。
 *
 * 职责：
 * 1. 通过后端 WS 代理连接 Gateway（后端已完成 device auth）
 * 2. RPC 请求/响应匹配（通过 req.id）
 * 3. 事件分发（event 帧广播给所有订阅者）
 * 4. 全局单例连接管理：连上即保持，断线后进入错误态，仅显式 connect()/disconnect() 才变更连接
 */

let ws = null;
let reqIdCounter = 0;
let reconnectTimer = null;
let expectedClose = false;
let currentProxyUrl = null;
let lastTickTime = 0;
let heartbeatTimer = null;
let stateListeners = new Set(); // (state) => void
const pendingReqs = new Map();   // id -> { resolve, reject, timer }
const eventListeners = new Set(); // (event) => void
let connectionState = "idle";     // idle | connecting | connected | error
let connectResolve = null;
let connectReject = null;

/* ---------- 心跳 / 状态 ---------- */

function resetHeartbeatTimer() {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(() => {
    console.warn("[OpenClaw] Heartbeat timeout, forcing reconnect");
    ws?.close();
  }, 300000); // 5 分钟心跳超时
}

function generateReqId() {
  return `req_${++reqIdCounter}_${Date.now()}`;
}

function setState(newState) {
  if (connectionState === newState) return;
  connectionState = newState;
  stateListeners.forEach((listener) => {
    try { listener(newState); } catch (e) { console.error(e); }
  });
}

/* ---------- Gateway 导出 ---------- */

export const openclawGateway = {
  get state() {
    return connectionState;
  },

  subscribeState(listener) {
    stateListeners.add(listener);
    listener(connectionState);
    return () => stateListeners.delete(listener);
  },

  async connect(proxyUrl, { isAutoReconnect = false } = {}) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const targetChanged = currentProxyUrl !== null && currentProxyUrl !== proxyUrl;
    currentProxyUrl = proxyUrl;

    if (ws && ws.readyState === WebSocket.OPEN && !targetChanged) {
      const lastTickAge = Date.now() - lastTickTime;
      if (lastTickTime > 0 && lastTickAge < 300000) {
        return Promise.resolve();
      }
      // 心跳过期，清理旧连接后继续重建
      const oldWs = ws;
      ws = null;
      oldWs.onclose = null;
      oldWs.onerror = null;
      oldWs.onmessage = null;
      oldWs.onopen = null;
      try { oldWs.close(); } catch {}
    }
    if (ws && ws.readyState === WebSocket.CONNECTING && !targetChanged) {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (!ws) { clearInterval(check); reject(new Error("Connection aborted")); }
          else if (ws.readyState === WebSocket.OPEN) { clearInterval(check); resolve(); }
          else if (ws.readyState === WebSocket.CLOSED) { clearInterval(check); reject(new Error("Connection failed")); }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          reject(new Error("Connection stuck in CONNECTING"));
        }, 15000);
      });
    }

    // 清理可能残留的旧连接事件，防止旧的 onclose/onerror 破坏新的 ws
    if (ws) {
      const oldWs = ws;
      ws = null;
      oldWs.onclose = null;
      oldWs.onerror = null;
      oldWs.onmessage = null;
      oldWs.onopen = null;
      try { oldWs.close(); } catch {}
    }

    expectedClose = false;
    setState("connecting");
    return new Promise((resolve, reject) => {
      connectResolve = resolve;
      connectReject = reject;
      try {
        ws = new WebSocket(proxyUrl);
      } catch (err) {
        connectResolve = null;
        connectReject = null;
        setState("error");
        reject(err);
        return;
      }

      ws.onopen = () => {
        lastTickTime = Date.now();
        resetHeartbeatTimer();
        setState("connected");
        const r = connectResolve;
        connectResolve = null;
        connectReject = null;
        if (r) r();
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          console.warn("[OpenClaw] Invalid JSON:", event.data);
          return;
        }

        // 心跳（支持 tick / health 两种事件名）
        if (msg.type === "event" && (msg.event === "tick" || msg.event === "health")) {
          lastTickTime = Date.now();
          resetHeartbeatTimer();
          return;
        }

        // 代理错误
        if (msg.type === "event" && msg.event === "proxy.error") {
          console.error("[OpenClaw] Proxy error:", msg.payload);
          return;
        }

        // 处理响应（Gateway 格式: {type:"res", id, ok, result|error}）
        if (msg.type === "res" && msg.id) {
          if (pendingReqs.has(msg.id)) {
            console.log(`[OpenClaw] RPC recv: ${msg.id} ok=${msg.ok}`);
            const { resolve, reject, timer } = pendingReqs.get(msg.id);
            clearTimeout(timer);
            pendingReqs.delete(msg.id);
            if (msg.ok === false || msg.error) {
              const errMsg = msg.error?.message || msg.error?.code || JSON.stringify(msg.error || { ok: false });
              reject(new Error(errMsg));
            } else {
              resolve(msg.result || msg.payload);
            }
          } else {
            console.warn(`[OpenClaw] Orphan response: ${msg.id}`, msg);
          }
          return;
        }

        // 处理错误响应
        if (msg.type === "res-err" && msg.id) {
          if (pendingReqs.has(msg.id)) {
            console.log(`[OpenClaw] RPC recv err: ${msg.id}`);
            const { reject, timer } = pendingReqs.get(msg.id);
            clearTimeout(timer);
            pendingReqs.delete(msg.id);
            reject(new Error(msg.error?.message || JSON.stringify(msg.error)));
          } else {
            console.warn(`[OpenClaw] Orphan error response: ${msg.id}`, msg);
          }
          return;
        }

        // 处理事件
        if (msg.type === "event") {
          console.log(`[OpenClaw] Event: ${msg.event}`);
          eventListeners.forEach((listener) => {
            try {
              listener(msg);
            } catch (err) {
              console.error("[OpenClaw] Event listener error:", err);
            }
          });
          return;
        }

        // 未知消息格式
        console.warn("[OpenClaw] Unhandled message:", msg);
      };

      ws.onerror = (err) => {
        console.error("[OpenClaw] WS error:", err);
        setState("error");
        pendingReqs.forEach(({ reject, timer }) => {
          clearTimeout(timer);
          reject(new Error("WebSocket error"));
        });
        pendingReqs.clear();
        const r = connectReject;
        connectResolve = null;
        connectReject = null;
        if (r) r(new Error("WebSocket error"));
        ws.onclose = null;
        ws?.close();
      };

      ws.onclose = () => {
        const wasExpected = expectedClose;
        ws = null;
        pendingReqs.forEach(({ reject, timer }) => {
          clearTimeout(timer);
          reject(new Error("WebSocket closed"));
        });
        pendingReqs.clear();

        if (!wasExpected) {
          const r = connectReject;
          connectResolve = null;
          connectReject = null;
          if (r) r(new Error("WebSocket closed"));
          setState("error");
        } else {
          setState("idle");
        }
      };
    });
  },

  disconnect() {
    expectedClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (ws) {
      const oldWs = ws;
      ws = null;
      oldWs.onclose = null;
      oldWs.onerror = null;
      oldWs.onmessage = null;
      oldWs.onopen = null;
      try { oldWs.close(); } catch {}
    }
    setState("idle");
    lastTickTime = 0;
    if (connectReject) {
      connectReject(new Error("Disconnected manually"));
      connectReject = null;
      connectResolve = null;
    }
    pendingReqs.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error("Disconnected manually"));
    });
    pendingReqs.clear();
  },

  rpc(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const reqId = generateReqId();
      const payload = {
        type: "req",
        id: reqId,
        method,
        params,
      };

      const timer = setTimeout(() => {
        pendingReqs.delete(reqId);
        console.error(`[OpenClaw] RPC timeout: ${method} (reqId=${reqId})`);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      pendingReqs.set(reqId, { resolve, reject, timer });
      console.log(`[OpenClaw] RPC send: ${method} (reqId=${reqId})`);
      ws.send(JSON.stringify(payload));
    });
  },

  subscribe(listener) {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  },
};