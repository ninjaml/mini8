import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/dialog/ConfirmDialog";
import { useCronUnreadMap } from "./useCronUnread";

const CRON_PRESETS = [
  { label: "每小时整点", value: "0 * * * *" },
  { label: "每天上午9点", value: "0 9 * * *" },
  { label: "每天下午6点", value: "0 18 * * *" },
  { label: "每周一上午9点", value: "0 9 * * 1" },
  { label: "每月1日上午9点", value: "0 9 1 * *" },
  { label: "每5分钟", value: "*/5 * * * *" },
  { label: "每15分钟", value: "*/15 * * * *" },
  { label: "自定义", value: "custom" },
];

function parseCron(schedule) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return { minute: parts[0], hour: parts[1], day: parts[2], month: parts[3], weekday: parts[4] };
}

function describeCron(schedule) {
  const p = parseCron(schedule);
  if (!p) return schedule;
  const { minute, hour, day, month, weekday } = p;
  if (minute === "0" && hour === "9" && day === "*" && month === "*" && weekday === "*") return "每天上午 9:00";
  if (minute === "0" && hour === "18" && day === "*" && month === "*" && weekday === "*") return "每天下午 6:00";
  if (minute === "0" && hour === "9" && day === "*" && month === "*" && weekday === "1") return "每周一上午 9:00";
  if (minute === "0" && hour === "9" && day === "1" && month === "*" && weekday === "*") return "每月1日上午 9:00";
  if (minute === "0" && hour === "*" && day === "*" && month === "*" && weekday === "*") return "每小时整点";
  if (minute === "*/5" && hour === "*" && day === "*" && month === "*" && weekday === "*") return "每5分钟";
  if (minute === "*/15" && hour === "*" && day === "*" && month === "*" && weekday === "*") return "每15分钟";
  const parts = [];
  if (month !== "*") parts.push(`${month}月`);
  if (day !== "*") parts.push(`${day}日`);
  if (weekday !== "*") {
    const map = { "0": "周日", "1": "周一", "2": "周二", "3": "周三", "4": "周四", "5": "周五", "6": "周六" };
    parts.push(map[weekday] || weekday);
  }
  if (hour !== "*") parts.push(`${hour}点`);
  if (minute !== "*") parts.push(`${minute}分`);
  return parts.length > 0 ? parts.join(" ") + " 执行" : schedule;
}

const MINUTE_OPTIONS = [
  { value: "*", label: "每分钟" },
  { value: "*/5", label: "每5分钟" },
  { value: "*/10", label: "每10分钟" },
  { value: "*/15", label: "每15分钟" },
  { value: "*/30", label: "每30分钟" },
  ...Array.from({ length: 60 }, (_, i) => ({ value: String(i), label: `${i}分` })),
];

const HOUR_OPTIONS = [
  { value: "*", label: "每小时" },
  ...Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${i}点` })),
];

const DAY_OPTIONS = [
  { value: "*", label: "每天" },
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}日` })),
];

const MONTH_OPTIONS = [
  { value: "*", label: "每月" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` })),
];

const WEEKDAY_OPTIONS = [
  { value: "*", label: "每天" },
  { value: "1", label: "周一" },
  { value: "2", label: "周二" },
  { value: "3", label: "周三" },
  { value: "4", label: "周四" },
  { value: "5", label: "周五" },
  { value: "6", label: "周六" },
  { value: "0", label: "周日" },
];

function CronPicker({ value, onChange }) {
  const [mode, setMode] = useState(() => {
    const found = CRON_PRESETS.find((p) => p.value === value);
    return found && found.value !== "custom" ? "preset" : "custom";
  });
  const [preset, setPreset] = useState(() => {
    const found = CRON_PRESETS.find((p) => p.value === value);
    return found ? found.value : "custom";
  });
  const [parts, setParts] = useState(() => {
    const parsed = parseCron(value);
    return parsed || { minute: "0", hour: "9", day: "*", month: "*", weekday: "*" };
  });

  const applyPreset = (val) => {
    setPreset(val);
    if (val === "custom") {
      setMode("custom");
      return;
    }
    setMode("preset");
    onChange(val);
  };

  const updatePart = (key, val) => {
    const next = { ...parts, [key]: val };
    setParts(next);
    onChange(`${next.minute} ${next.hour} ${next.day} ${next.month} ${next.weekday}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CRON_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => applyPreset(p.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              background: preset === p.value ? "#111827" : "#fff",
              color: preset === p.value ? "#fff" : "#374151",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {mode === "custom" || preset === "custom" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {[
            { key: "minute", label: "分钟", options: MINUTE_OPTIONS },
            { key: "hour", label: "小时", options: HOUR_OPTIONS },
            { key: "day", label: "日期", options: DAY_OPTIONS },
            { key: "month", label: "月份", options: MONTH_OPTIONS },
            { key: "weekday", label: "星期", options: WEEKDAY_OPTIONS },
          ].map((field) => (
            <label key={field.key}>
              <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 700, color: "#6b7280" }}>{field.label}</div>
              <select
                value={parts[field.key]}
                onChange={(e) => updatePart(field.key, e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db", fontSize: 12 }}
              >
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6b7280" }}>
        <code style={{ padding: "4px 8px", borderRadius: 6, background: "#f3f4f6", color: "#111827" }}>{value}</code>
        <span>{describeCron(value)}</span>
      </div>
    </div>
  );
}

const KIND_LABELS = {
  moss: "MOSS",
  workspace_superagent: "项目经理",
  workagent: "执行专员",
};

const KIND_OPTIONS = [
  { value: "moss", label: "MOSS" },
  { value: "workspace_superagent", label: "项目经理 (SuperAgent)" },
  { value: "workagent", label: "执行专员 (WorkAgent)" },
];

function normalizeTargetId(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? String(value) : parsed;
}

function buildDefaultForm(scope) {
  return {
    kind: scope?.kind || "moss",
    target_id: scope?.targetId != null ? String(scope.targetId) : "",
    name: "",
    schedule: "0 9 * * *",
    prompt: "",
  };
}

function matchesScope(job, scope) {
  if (!scope?.kind) return true;
  if (job.kind !== scope.kind) return false;
  return normalizeTargetId(job.target_id) === normalizeTargetId(scope.targetId);
}

function getJobOwnerLabel(job) {
  if (job.kind === "moss") return "MOSS";
  if (job.kind === "workspace_superagent") return `项目经理 #${job.target_id}`;
  if (job.kind === "workagent") return `执行专员 #${job.target_id}`;
  return job.kind;
}

function getStatusTone(job) {
  if (!job.enabled) {
    return { bg: "#f3f4f6", color: "#6b7280", text: "已暂停" };
  }
  if (job.is_running) {
    return { bg: "#dbeafe", color: "#2563eb", text: "执行中" };
  }
  if (job.last_status === "error") {
    return { bg: "#fee2e2", color: "#b91c1c", text: "异常" };
  }
  if (job.last_status === "success" || job.last_status === null || job.last_status === undefined) {
    return { bg: "#dcfce7", color: "#15803d", text: "正常" };
  }
  if (job.last_status === "skipped") {
    return { bg: "#fef3c7", color: "#b45309", text: "跳过" };
  }
  return { bg: "#e5e7eb", color: "#4b5563", text: "已暂停" };
}

function formatLastRun(job) {
  if (!job.last_run_at) return "从未运行";
  const status = job.last_status ? ` · ${job.last_status}` : "";
  return `${new Date(job.last_run_at).toLocaleString()}${status}`;
}

function SummaryCard({ title, value, hint, color, bg }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: "#fff",
        border: "1px solid rgba(0, 0, 0, 0.06)",
        minHeight: 116,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{title}</div>
      <div style={{ marginTop: 12, fontSize: 34, fontWeight: 800, color }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: "#6b7280" }}>{hint}</div>
      <div
        style={{
          marginTop: 12,
          width: 40,
          height: 4,
          borderRadius: 999,
          background: bg,
        }}
      />
    </div>
  );
}

function CronJobEditor({
  editingJob,
  isScoped,
  scope,
  form,
  setForm,
  formError,
  showTargetId,
  onCancel,
  onSubmit,
}) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 22 }}>{editingJob ? "编辑定时任务" : "新建定时任务"}</h3>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
            {editingJob
              ? `正在编辑「${editingJob.name}」。只能修改名称、计划和 Prompt，不能变更 Agent 绑定。`
              : isScoped ? `这个任务会绑定到 ${scope.label || "当前对象"}。` : "创建后会按设定周期自动触发。"}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {formError ? (
          <div
            style={{
              color: "#b91c1c",
              padding: 10,
              background: "#fef2f2",
              borderRadius: 10,
              border: "1px solid #fecaca",
              fontSize: 13,
            }}
          >
            {formError}
          </div>
        ) : null}
        {!isScoped ? (
          <label>
            <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, color: "#374151" }}>Agent 类型</div>
            <select
              value={form.kind}
              disabled={!!editingJob}
              onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value, target_id: "" }))}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db", opacity: editingJob ? 0.6 : 1 }}
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showTargetId ? (
          <label>
            <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, color: "#374151" }}>
              {form.kind === "workspace_superagent" ? "Workspace ID" : "Agent ID"}
            </div>
            <input
              type="number"
              value={form.target_id}
              disabled={!!editingJob}
              onChange={(e) => setForm((prev) => ({ ...prev, target_id: e.target.value }))}
              placeholder="输入 ID"
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db", opacity: editingJob ? 0.6 : 1 }}
            />
          </label>
        ) : null}

        <label>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, color: "#374151" }}>任务名称</div>
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="例如：每日晨报"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, color: "#374151" }}>执行计划</div>
          <CronPicker
            value={form.schedule}
            onChange={(schedule) => setForm((prev) => ({ ...prev, schedule }))}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, color: "#374151" }}>Prompt</div>
          <textarea
            value={form.prompt}
            onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
            placeholder="触发时发送给 Agent 的指令"
            rows={5}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db", resize: "vertical" }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button className="secondary-btn" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-btn" type="button" onClick={onSubmit}>
            {editingJob ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CronManager({
  scope = null,
  title = "本地定时任务",
  subtitle = "管理自动触发的 agent 工作。",
  embedded = false,
  showSummary = true,
  emptyText = "暂无定时任务",
  showCreateButton = true,
  showRefreshButton = true,
  onMutate,
  onNavigateToHistory,
}) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmRun, setConfirmRun] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [form, setForm] = useState(() => buildDefaultForm(scope));

  const isScoped = Boolean(scope?.kind);

  useEffect(() => {
    setForm(buildDefaultForm(scope));
  }, [scope?.kind, scope?.targetId]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listCronJobs();
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => matchesScope(job, scope))
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
  }, [jobs, scope]);

  const summary = useMemo(() => {
    const enabledCount = filteredJobs.filter((job) => job.enabled).length;
    const pausedCount = filteredJobs.length - enabledCount;
    const errorCount = filteredJobs.filter((job) => job.last_status === "error").length;
    const successCount = filteredJobs.filter((job) => job.last_status === "success").length;
    return { enabledCount, pausedCount, errorCount, successCount };
  }, [filteredJobs]);

  const recentJobs = useMemo(() => filteredJobs.slice(0, 5), [filteredJobs]);

  const uniqueScopes = useMemo(() => {
    if (!onNavigateToHistory) return [];
    const seen = new Set();
    const scopes = [];
    for (const job of recentJobs) {
      const key = `${job.kind}:${job.target_id ?? "null"}`;
      if (!seen.has(key)) {
        seen.add(key);
        scopes.push({ kind: job.kind, targetId: job.target_id });
      }
    }
    return scopes;
  }, [recentJobs, onNavigateToHistory]);

  const { unreadMap, markRead: markScopeRead } = useCronUnreadMap(uniqueScopes, !!onNavigateToHistory);

  const [formError, setFormError] = useState("");
  const inlineEditor = embedded && showAdd;
  const actionColumnMinWidth = onNavigateToHistory ? 360 : 300;
  const cronTableMinWidth = isScoped ? 1080 : 1240;

  const closeEditor = () => {
    setShowAdd(false);
    setEditingJob(null);
    setForm(buildDefaultForm(scope));
    setFormError("");
  };

  const openEditModal = (job) => {
    setEditingJob(job);
    setForm({
      kind: job.kind || "moss",
      target_id: job.target_id != null ? String(job.target_id) : "",
      name: job.name || "",
      schedule: job.schedule || "0 9 * * *",
      prompt: job.prompt || "",
    });
    setFormError("");
    setShowAdd(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.schedule.trim() || !form.prompt.trim()) {
      setFormError("请填写完整信息");
      return;
    }

    if (editingJob) {
      const payload = {
        name: form.name.trim(),
        schedule: form.schedule.trim(),
        prompt: form.prompt.trim(),
      };
      try {
        await api.updateCronJob(editingJob.id, payload);
        closeEditor();
        await loadJobs();
        onMutate?.();
      } catch (err) {
        setFormError(err.message || "保存失败");
      }
      return;
    }

    const payload = {
      kind: isScoped ? scope.kind : form.kind,
      name: form.name.trim(),
      schedule: form.schedule.trim(),
      prompt: form.prompt.trim(),
    };

    const targetIdRaw = isScoped ? scope.targetId : form.target_id.trim();
    if (targetIdRaw !== "" && targetIdRaw !== null && targetIdRaw !== undefined) {
      payload.target_id = Number(targetIdRaw);
    }

    try {
      await api.createCronJob(payload);
      closeEditor();
      await loadJobs();
      onMutate?.();
    } catch (err) {
      setFormError(err.message || "创建失败");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteCronJob(id);
      await loadJobs();
      onMutate?.();
    } catch (err) {
      setError(err.message || "删除失败");
    }
  };

  const handleToggle = async (job) => {
    try {
      await api.toggleCronJob(job.id);
      await loadJobs();
      onMutate?.();
    } catch (err) {
      setError(err.message || "切换失败");
    }
  };

  const handleRun = async (id) => {
    try {
      await api.runCronJob(id);
      await loadJobs();
      onMutate?.();
    } catch (err) {
      setError(err.message || "触发失败");
    }
  };

  const showTargetId = !isScoped && form.kind !== "moss";

  return (
    <div
      className="cron-page"
      style={{
        padding: embedded ? 0 : 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: embedded ? 24 : 28, fontWeight: 800 }}>{title}</h2>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>{subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {inlineEditor ? (
            <button className="secondary-btn" type="button" onClick={closeEditor}>
              返回列表
            </button>
          ) : null}
          {showRefreshButton && !inlineEditor ? (
            <button className="secondary-btn" type="button" onClick={loadJobs}>
              刷新
            </button>
          ) : null}
          {showCreateButton && !inlineEditor ? (
            <button className="primary-btn" type="button" onClick={() => setShowAdd(true)}>
              + 新建任务
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          style={{
            color: "#b91c1c",
            padding: 12,
            background: "#fef2f2",
            borderRadius: 12,
            border: "1px solid #fecaca",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {showSummary && !inlineEditor ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            maxWidth: 1080,
          }}
        >
          <SummaryCard title="任务总数" value={filteredJobs.length} hint="当前范围内的全部任务" color="#2563eb" bg="#bfdbfe" />
          <SummaryCard title="启用中" value={summary.enabledCount} hint="会按计划自动触发" color="#059669" bg="#a7f3d0" />
          <SummaryCard title="最近成功" value={summary.successCount} hint="最近执行状态为 success 的任务" color="#7c3aed" bg="#ddd6fe" />
          <SummaryCard title="异常 / 暂停" value={`${summary.errorCount} / ${summary.pausedCount}`} hint="需要关注的任务" color="#dc2626" bg="#fecaca" />
        </div>
      ) : null}

      {inlineEditor ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            border: "1px solid rgba(0, 0, 0, 0.06)",
            overflow: "hidden",
          }}
        >
          <CronJobEditor
            editingJob={editingJob}
            isScoped={isScoped}
            scope={scope}
            form={form}
            setForm={setForm}
            formError={formError}
            showTargetId={showTargetId}
            onCancel={closeEditor}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            border: "1px solid rgba(0, 0, 0, 0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "18px 20px",
              borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>任务列表</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                {isScoped ? "只展示当前 agent 的任务。" : "展示全部 agent 的定时任务。"}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>最近共 {filteredJobs.length} 条</div>
          </div>

          {loading ? (
            <div style={{ padding: 24, color: "#6b7280" }}>加载中...</div>
          ) : filteredJobs.length === 0 ? (
            <div style={{ padding: 24, color: "#6b7280" }}>{emptyText}</div>
          ) : (
            <div style={{ overflowX: "auto", paddingBottom: 6 }}>
              <table
                style={{
                  width: "max-content",
                  minWidth: `max(100%, ${cronTableMinWidth}px)`,
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", minWidth: 220, whiteSpace: "nowrap" }}>名称</th>
                    {!isScoped ? <th style={{ padding: "12px 16px", minWidth: 170, whiteSpace: "nowrap" }}>对象</th> : null}
                    <th style={{ padding: "12px 16px", minWidth: 190, whiteSpace: "nowrap" }}>调度</th>
                    <th style={{ padding: "12px 16px", minWidth: 96, whiteSpace: "nowrap" }}>状态</th>
                    <th style={{ padding: "12px 16px", minWidth: 180, whiteSpace: "nowrap" }}>最近执行</th>
                    <th style={{ padding: "12px 16px", minWidth: 110, whiteSpace: "nowrap" }}>累计执行</th>
                    <th style={{ padding: "12px 16px", minWidth: actionColumnMinWidth, whiteSpace: "nowrap" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job) => {
                    const tone = getStatusTone(job);
                    return (
                      <tr key={job.id} style={{ borderTop: "1px solid rgba(0, 0, 0, 0.06)" }}>
                        <td style={{ padding: "14px 16px", verticalAlign: "top", minWidth: 220 }}>
                          <div style={{ fontWeight: 700, color: "#111827" }}>
                            {job.name}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>#{job.id}</div>
                        </td>
                        {!isScoped ? (
                          <td style={{ padding: "14px 16px", verticalAlign: "top", color: "#4b5563", minWidth: 170 }}>
                            {getJobOwnerLabel(job)}
                          </td>
                        ) : null}
                        <td style={{ padding: "14px 16px", verticalAlign: "top", minWidth: 190 }}>
                          <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                            {describeCron(job.schedule)}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                            {job.schedule}
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px", verticalAlign: "top", minWidth: 96 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "4px 10px",
                              borderRadius: 999,
                              background: tone.bg,
                              color: tone.color,
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {tone.text}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", verticalAlign: "top", color: "#4b5563", minWidth: 180, whiteSpace: "nowrap" }}>
                          <div>{formatLastRun(job)}</div>
                          {job.last_error ? (
                            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c", whiteSpace: "normal" }}>{job.last_error}</div>
                          ) : null}
                        </td>
                        <td style={{ padding: "14px 16px", verticalAlign: "top", color: "#4b5563", fontWeight: 700, minWidth: 110, whiteSpace: "nowrap" }}>
                          {job.run_count ?? 0}
                        </td>
                        <td style={{ padding: "14px 16px", verticalAlign: "top", minWidth: actionColumnMinWidth, whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>
                            {(() => {
                              const labels = ["编辑", "触发", job.enabled ? "暂停" : "启用", "删除"];
                              if (onNavigateToHistory) labels.push("历史");
                              return labels.map((label, i) => {
                                const isHistory = label === "历史";
                                const scopeKey = isHistory ? `${job.kind}:${job.target_id ?? "null"}` : null;
                                const isUnread = isHistory && !!unreadMap[scopeKey];
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                      if (i === 0) openEditModal(job);
                                      else if (i === 1) setConfirmRun(job);
                                      else if (i === 2) setConfirmToggle(job);
                                      else if (i === 3) setConfirmDelete(job);
                                      else if (onNavigateToHistory) {
                                        if (isUnread) markScopeRead(scopeKey);
                                        onNavigateToHistory({ kind: job.kind, targetId: job.target_id, jobId: job.id });
                                      }
                                    }}
                                    style={{
                                      padding: "6px 16px",
                                      fontSize: 13,
                                      borderRadius: 8,
                                      border: "1px solid rgba(0,0,0,0.08)",
                                      background: "#fff",
                                      color: "#374151",
                                      cursor: "pointer",
                                      whiteSpace: "nowrap",
                                      lineHeight: 1.4,
                                      position: isUnread ? "relative" : undefined,
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = "#f9fafb";
                                      e.currentTarget.style.borderColor = "rgba(0,0,0,0.14)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "#fff";
                                      e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
                                    }}
                                  >
                                    {label}
                                    {isUnread && (
                                      <span
                                        style={{
                                          position: "absolute",
                                          top: 2,
                                          right: 2,
                                          width: 8,
                                          height: 8,
                                          borderRadius: "50%",
                                          background: "#ef4444",
                                          border: "2px solid #fff",
                                        }}
                                      />
                                    )}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!embedded ? (
        <Modal open={showAdd} onClose={closeEditor} className="modal-wide">
          <CronJobEditor
            editingJob={editingJob}
            isScoped={isScoped}
            scope={scope}
            form={form}
            setForm={setForm}
            formError={formError}
            showTargetId={showTargetId}
            onCancel={closeEditor}
            onSubmit={handleSubmit}
          />
        </Modal>
      ) : null}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="删除定时任务"
        message={`确认删除「${confirmDelete?.name || ""}」吗？`}
        onConfirm={async () => {
          if (confirmDelete) {
            await handleDelete(confirmDelete.id);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        isOpen={!!confirmRun}
        title="手动触发任务"
        message={`确认立即执行「${confirmRun?.name || ""}」吗？`}
        onConfirm={async () => {
          if (confirmRun) {
            await handleRun(confirmRun.id);
          }
          setConfirmRun(null);
        }}
        onCancel={() => setConfirmRun(null)}
      />

      <ConfirmDialog
        isOpen={!!confirmToggle}
        title={confirmToggle?.enabled ? "暂停定时任务" : "启用定时任务"}
        message={`确认${confirmToggle?.enabled ? "暂停" : "启用"}「${confirmToggle?.name || ""}」吗？`}
        onConfirm={async () => {
          if (confirmToggle) {
            await handleToggle(confirmToggle);
          }
          setConfirmToggle(null);
        }}
        onCancel={() => setConfirmToggle(null)}
      />
    </div>
  );
}

export function CronPage() {
  return (
    <CronManager
      title="本地定时任务"
      subtitle="统一管理 MOSS、项目经理和执行专员的定时任务。"
      embedded={false}
      showSummary
      emptyText="暂无定时任务"
    />
  );
}
