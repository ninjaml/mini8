import { useState } from "react";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";

export function CronTab({ cron }) {
  const { jobs, loading, error, addJob, removeJob, runJob } = cron;
  const [showAddModal, setShowAddModal] = useState(false);
  const [newJobForm, setNewJobForm] = useState({ name: "", schedule: "", command: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleAdd = async () => {
    if (!newJobForm.name.trim() || !newJobForm.schedule.trim()) return;
    try {
      await addJob({
        name: newJobForm.name.trim(),
        schedule: newJobForm.schedule.trim(),
        command: newJobForm.command.trim() || undefined,
      });
      setShowAddModal(false);
      setNewJobForm({ name: "", schedule: "", command: "" });
    } catch {
      // error 已在 hook 中设置
    }
  };

  return (
    <div className="openclaw-tab-content openclaw-cron">
      <div className="openclaw-cron-header">
        <h4>定时任务</h4>
        <button type="button" className="openclaw-add-btn" onClick={() => setShowAddModal(true)}>
          + 添加任务
        </button>
      </div>

      {jobs.length === 0 ? (
        <p className="openclaw-empty">暂无定时任务</p>
      ) : (
        <table className="openclaw-cron-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>调度</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.name}</td>
                <td>
                  <code>
                    {typeof job.schedule === "string"
                      ? job.schedule
                      : job.schedule?.expr || JSON.stringify(job.schedule)}
                  </code>
                </td>
                <td>
                  <span className={`openclaw-badge ${job.enabled !== false ? "enabled" : "disabled"}`}>
                    {job.enabled !== false ? "启用" : "禁用"}
                  </span>
                </td>
                <td>
                  <button type="button" className="openclaw-action-btn" onClick={() => runJob(job.id)}>
                    触发
                  </button>
                  <button
                    type="button"
                    className="openclaw-action-btn danger"
                    onClick={() => setConfirmDelete(job)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <div className="openclaw-error-msg">{error}</div>}

      {/* 添加任务弹窗 */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="添加定时任务">
        <div className="openclaw-form">
          <label>名称</label>
          <input
            value={newJobForm.name}
            onChange={(e) => setNewJobForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="任务名称"
          />
          <label>Cron 表达式</label>
          <input
            value={newJobForm.schedule}
            onChange={(e) => setNewJobForm((p) => ({ ...p, schedule: e.target.value }))}
            placeholder="* * * * *"
          />
          <label>命令（可选）</label>
          <input
            value={newJobForm.command}
            onChange={(e) => setNewJobForm((p) => ({ ...p, command: e.target.value }))}
            placeholder="要执行的命令"
          />
          <div className="openclaw-form-actions">
            <button type="button" onClick={() => setShowAddModal(false)}>取消</button>
            <button type="button" onClick={handleAdd} disabled={!newJobForm.name.trim() || !newJobForm.schedule.trim()}>
              添加
            </button>
          </div>
        </div>
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="删除定时任务"
        message={`确认删除任务「${confirmDelete?.name}」吗？`}
        onConfirm={async () => {
          if (confirmDelete) {
            await removeJob(confirmDelete.id);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
