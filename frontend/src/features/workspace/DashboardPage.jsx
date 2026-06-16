import { useState } from "react";
import { Crown, Bot, ListTodo, Clock, BookOpen, Trophy, Pencil } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { api } from "../../lib/api";

export function DashboardPage({ onDeleteWorkspace, onDownloadWorkspaceSkill, onOpenResults, onUpdateWorkspace, onOpenManage, showDeleteWorkspace = false, workspace }) {
  const dash = workspace.dashboard;
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  function openEdit() {
    setEditName(workspace.name || "");
    setEditGoal(workspace.goal || "");
    setEditError("");
    setEditOpen(true);
  }

  async function handleSave() {
    const name = editName.trim();
    if (!name) {
      setEditError("工作空间名称不能为空");
      return;
    }
    setEditLoading(true);
    try {
      await api.updateWorkspace(workspace.rawId, {
        name,
        goal: editGoal.trim() || null,
      });
      setEditOpen(false);
      if (onUpdateWorkspace) await onUpdateWorkspace();
    } catch (error) {
      setEditError(error.message || "保存失败");
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <section id="view-ws-dashboard" className="view-container">
      <div className="page-head dashboard-page-head">
        <div className="dashboard-page-head__main">
          <div className="dashboard-page-head__eyebrow">工作空间总览</div>
          <h2>运行总览</h2>
          <p>实时查看当前工作空间的成员状态、任务推进与知识库挂载情况。</p>
        </div>
        <div className="page-actions dashboard-page-actions">
          {onOpenManage && (
            <button className="primary-btn compact" type="button" onClick={onOpenManage}>
              进入工作室
            </button>
          )}
          <button className="secondary-btn compact" type="button" onClick={onDownloadWorkspaceSkill}>
            用你的智能体管理
          </button>
          {showDeleteWorkspace && (
            <button className="secondary-btn compact danger-btn" type="button" onClick={onDeleteWorkspace}>
              删除空间
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-goal-card dashboard-goal-card--accent">
        <div className="dashboard-goal-card__backdrop" />
        <div className="dashboard-goal-card__content">
          <div className="dashboard-goal-card__meta">
            <div className="dashboard-goal-label">工作总目标</div>
            <div className="dashboard-goal-content">{workspace.goal}</div>
          </div>
          <button
            className="dashboard-goal-edit-btn"
            onClick={openEdit}
            title="编辑"
            type="button"
          >
            <Pencil size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dash-card dash-card--pm">
          <div className="card-title">项目经理</div>
          <div className="dash-manager-row">
            <div className="dash-icon-shell dash-icon-shell--pm">
              <Crown size={20} strokeWidth={2} />
            </div>
            <div className="dash-pm-meta">
              <h3>{workspace.superAgentName}</h3>
              <div className="item-badge green">已配置 / 在线</div>
            </div>
          </div>
          <p>当前工作空间由项目经理统筹，负责拆解任务、调度工作成员并回收成果。</p>
        </div>

        <div className="dash-card dash-card--metric dash-card--agents">
          <div className="card-title">工作成员</div>
          <div className="dash-manager-row">
            <div className="dash-icon-shell dash-icon-shell--agents">
              <Bot size={20} strokeWidth={2} />
            </div>
            <div className="big-number">{dash.agentCount}</div>
          </div>
          <p>已接入 {dash.agentCount} 名工作成员</p>
        </div>

        <div className="dash-card dash-card--metric dash-card--items">
          <div className="card-title">任务卡片</div>
          <div className="dash-manager-row">
            <div className="dash-icon-shell dash-icon-shell--items">
              <ListTodo size={20} strokeWidth={2} />
            </div>
            <div className="big-number">{dash.itemCount}</div>
          </div>
          <p>当前共有 {dash.itemCount} 张任务卡片</p>
        </div>

        <div className="dash-card dash-card--metric dash-card--pending">
          <div className="card-title">待办任务</div>
          <div className="dash-manager-row">
            <div className="dash-icon-shell dash-icon-shell--pending">
              <Clock size={20} strokeWidth={2} />
            </div>
            <div className="big-number">{dash.todoCount}</div>
          </div>
          <p>需要人工审核，主要集中在成果验收环节。</p>
        </div>

        <div className="dash-card dash-card--metric dash-card--knowledge">
          <div className="card-title">知识库</div>
          <div className="dash-manager-row">
            <div className="dash-icon-shell dash-icon-shell--knowledge">
              <BookOpen size={20} strokeWidth={2} />
            </div>
            <div className="big-number">{dash.knowledgeCount}</div>
          </div>
          <p>已接入 {dash.knowledgeCount} 个知识库</p>
        </div>

        <div className="dash-card dash-card--metric dash-card--results">
          <div className="card-title">工作成果</div>
          <div className="dash-manager-row">
            <div className="dash-icon-shell dash-icon-shell--results">
              <Trophy size={20} strokeWidth={2} />
            </div>
            <div className="big-number">{dash.resultCount}</div>
          </div>
          <p>已同步 {dash.resultCount} 份交付物</p>
          <button className="secondary-btn dashboard-link-btn" type="button" onClick={onOpenResults}>
            查看全部
          </button>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} className="modal-narrow">
        <div className="modal-header">
          <div>
            <h3>编辑工作空间</h3>
            <p>修改当前空间的名称与工作总目标。</p>
          </div>
          <button className="close-btn" onClick={() => setEditOpen(false)}>×</button>
        </div>
        <div className="modal-body">
          <label className="form-label">空间名称</label>
          <input
            className="form-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="请输入空间名称"
          />
          <label className="form-label">工作总目标</label>
          <textarea
            className="form-input"
            value={editGoal}
            onChange={(e) => setEditGoal(e.target.value)}
            placeholder="请输入工作总目标"
          />
          {editError && <div className="modal-inline-error">{editError}</div>}
        </div>
        <div className="modal-footer">
          <button className="secondary-btn" type="button" onClick={() => setEditOpen(false)}>取消</button>
          <button className="primary-btn" type="button" onClick={handleSave} disabled={editLoading}>
            {editLoading ? "保存中…" : "保存"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
