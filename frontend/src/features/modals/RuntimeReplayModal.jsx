import { useEffect, useMemo, useState } from "react";
import { GitBranch, ListTree, Sparkles } from "lucide-react";
import { Modal } from "../../components/common/Modal";

function formatTimestamp(value) {
  if (!value) return "";
  if (typeof value === "string" && value.length >= 16) {
    return value.slice(5, 16);
  }
  return String(value);
}

function formatEventType(type) {
  return String(type || "event").replaceAll("_", " ");
}

function ReplayEventList({ events = [] }) {
  if (!events.length) {
    return <div className="runtime-replay-modal__empty">当前分支还没有可展示的事件。</div>;
  }

  return (
    <div className="runtime-replay-modal__events">
      {events.map((event) => (
        <div key={event.id} className="runtime-replay-modal__event">
          <div className="runtime-replay-modal__event-head">
            <span className="runtime-replay-modal__event-type">{formatEventType(event.type)}</span>
            <span className="runtime-replay-modal__event-time">{formatTimestamp(event.created_at)}</span>
          </div>
          <pre className="runtime-replay-modal__event-content">{event.content || "(empty)"}</pre>
        </div>
      ))}
    </div>
  );
}

function ReplayBranchTree({ node, depth = 0 }) {
  if (!node) return null;

  return (
    <div className="runtime-replay-modal__branch" data-depth={depth}>
      <div className="runtime-replay-modal__branch-head">
        <span className="runtime-replay-modal__branch-path">{node.namespace_key || "root"}</span>
      </div>
      <ReplayEventList events={node.events || []} />
      {node.children?.length ? (
        <div className="runtime-replay-modal__branch-children">
          {node.children.map((child) => (
            <ReplayBranchTree key={child.namespace_key} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RuntimeReplayModal({ open, detail, loading, error, onClose }) {
  const invocationOptions = detail?.replayGroup?.invocations || [];
  const [selectedPane, setSelectedPane] = useState("root");

  useEffect(() => {
    if (!open) return;
    setSelectedPane("root");
  }, [open, detail?.groupId]);

  const selectedInvocation = useMemo(
    () => invocationOptions.find((item) => item.subagent_invocation_id === selectedPane) || null,
    [invocationOptions, selectedPane],
  );

  const summary = useMemo(() => {
    const replayGroup = detail?.replayGroup;
    return {
      rootCount: replayGroup?.root_events?.length || 0,
      invocationCount: replayGroup?.invocations?.length || 0,
    };
  }, [detail]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="runtime-replay-modal"
      style={{ width: "min(1160px, calc(100vw - 40px))" }}
    >
      <div className="runtime-replay-modal__body">
        <div className="runtime-replay-modal__head">
          <div>
            <h3>执行回放</h3>
            <p>
              {detail?.agentName || "Agent"}
              {detail?.groupId ? ` · ${detail.groupId}` : ""}
            </p>
          </div>
          <button type="button" className="runtime-replay-modal__close" onClick={onClose}>
            关闭
          </button>
        </div>

        {loading ? <div className="runtime-replay-modal__state">正在加载完整子图回放...</div> : null}
        {!loading && error ? <div className="runtime-replay-modal__error">{error}</div> : null}
        {!loading && !error && !detail?.replayGroup ? (
          <div className="runtime-replay-modal__state">没有找到这次执行对应的回放数据。</div>
        ) : null}

        {!loading && !error && detail?.replayGroup ? (
          <>
            <div className="runtime-replay-modal__summary">
              <div className="runtime-replay-modal__summary-item">
                <ListTree size={15} strokeWidth={2} />
                主线事件 {summary.rootCount}
              </div>
              <div className="runtime-replay-modal__summary-item">
                <GitBranch size={15} strokeWidth={2} />
                Invocation {summary.invocationCount}
              </div>
            </div>

            <div className="runtime-replay-modal__shell">
              <aside className="runtime-replay-modal__sidebar">
                <button
                  type="button"
                  className={`runtime-replay-modal__sidebar-item ${selectedPane === "root" ? "is-active" : ""}`}
                  onClick={() => setSelectedPane("root")}
                >
                  <div className="runtime-replay-modal__sidebar-title">
                    <Sparkles size={14} strokeWidth={2} />
                    主线
                  </div>
                  <div className="runtime-replay-modal__sidebar-meta">
                    {(detail.replayGroup.root_events || []).length} 个事件
                  </div>
                </button>

                {invocationOptions.map((invocation) => (
                  <button
                    key={invocation.subagent_invocation_id}
                    type="button"
                    className={`runtime-replay-modal__sidebar-item ${selectedPane === invocation.subagent_invocation_id ? "is-active" : ""}`}
                    onClick={() => setSelectedPane(invocation.subagent_invocation_id)}
                  >
                    <div className="runtime-replay-modal__sidebar-title">
                      <GitBranch size={14} strokeWidth={2} />
                      {invocation.subagent_type || "Invocation"}
                    </div>
                    <div className="runtime-replay-modal__sidebar-meta">
                      {invocation.description || invocation.subagent_invocation_id}
                    </div>
                  </button>
                ))}
              </aside>

              <section className="runtime-replay-modal__content">
                {selectedPane === "root" ? (
                  <div className="runtime-replay-modal__panel">
                    <div className="runtime-replay-modal__panel-head">
                      <h4>主线事件</h4>
                    </div>
                    <ReplayEventList events={detail.replayGroup.root_events || []} />
                  </div>
                ) : (
                  <div className="runtime-replay-modal__panel">
                    <div className="runtime-replay-modal__panel-head">
                      <h4>{selectedInvocation?.subagent_type || "Invocation"}</h4>
                      <p>{selectedInvocation?.description || selectedInvocation?.subagent_invocation_id}</p>
                    </div>
                    <ReplayBranchTree node={selectedInvocation?.branch_tree} />
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
