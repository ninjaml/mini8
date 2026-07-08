import { Modal } from "../../components/common/Modal";

export function CreateAgentModal({
  error,
  form,
  open,
  onChange,
  onClose,
  onSubmit,
  title = "新增 Agent",
  description = "为当前工作空间接入一个已有 Agent。",
  mode = "workspace",
  agentOptions = [],
}) {
  const isGlobal = mode === "global";

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button className="close-btn" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        {isGlobal ? (
          <>
            <label className="form-label" htmlFor="new-agent-name">
              智能体名称
            </label>
            <input
              id="new-agent-name"
              className="form-input"
              value={form.name}
              onChange={(event) => onChange("name", event.target.value)}
              placeholder="例如：内容分析师"
            />
          </>
        ) : (
          <>
            <label className="form-label" htmlFor="bind-agent-id">
              选择 Agent
            </label>
            <select
              id="bind-agent-id"
              className="form-input"
              value={form.agent_id ?? ""}
              onChange={(event) => onChange("agent_id", event.target.value)}
            >
              <option value="">请选择一个已有 Agent</option>
              {agentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </>
        )}

        {error ? <div className="modal-inline-error">{error}</div> : null}
      </div>
      <div className="modal-footer">
        <button className="secondary-btn" type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary-btn" type="button" onClick={onSubmit}>
          {isGlobal ? "确认创建" : "确认接入"}
        </button>
      </div>
    </Modal>
  );
}
