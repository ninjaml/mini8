import { useEffect, useMemo, useState } from "react";
import { RefreshCw, History, ChevronDown, Play, ArrowLeft } from "lucide-react";
import { useCronHistory } from "./useCronHistory";
import { CronRunCard } from "./CronRunCard";
import { api } from "../../lib/api";

function formatDateTime(isoString) {
  if (!isoString) return "";
  let s = isoString.trim();
  if (s.includes(" ") && !s.includes("T")) {
    s = s.replace(" ", "T");
  }
  if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    s += "Z";
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return isoString;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function describeCron(schedule) {
  const p = schedule.trim().split(/\s+/);
  if (p.length !== 5) return schedule;
  const [minute, hour, day, month, weekday] = p;
  if (minute === "0" && hour === "9" && day === "*" && month === "*" && weekday === "*")
    return "每天上午 9:00";
  if (minute === "0" && hour === "18" && day === "*" && month === "*" && weekday === "*")
    return "每天下午 6:00";
  if (minute === "0" && hour === "9" && day === "*" && month === "*" && weekday === "1")
    return "每周一上午 9:00";
  if (minute === "0" && hour === "9" && day === "1" && month === "*" && weekday === "*")
    return "每月1日上午 9:00";
  if (minute === "0" && hour === "*" && day === "*" && month === "*" && weekday === "*")
    return "每小时整点";
  if (minute === "*/5" && hour === "*" && day === "*" && month === "*" && weekday === "*")
    return "每5分钟";
  if (minute === "*/15" && hour === "*" && day === "*" && month === "*" && weekday === "*")
    return "每15分钟";
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

function JobStatusDot({ status, enabled, isRunning }) {
  if (!enabled) return <span className="cron-status-dot cron-status-dot--disabled" />;
  if (isRunning) return <span className="cron-status-dot cron-status-dot--running" />;
  if (status === "success") return <span className="cron-status-dot cron-status-dot--success" />;
  if (status === "error") return <span className="cron-status-dot cron-status-dot--error" />;
  return <span className="cron-status-dot cron-status-dot--pending" />;
}

export function CronHistoryPage({
  kind,
  agentSessionId,
  agentName,
  defaultJobId,
  onBack = null,
  backLabel = "返回对话",
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const {
    jobs,
    selectedJobId,
    selectedJob,
    detail,
    loadingList,
    loadingDetail,
    error,
    appendError,
    selectJob,
    reload,
    loadMoreGroups,
  } = useCronHistory({ kind, agentSessionId, defaultJobId });

  const scopeTitle = useMemo(() => {
    if (kind === "moss") return "MOSS";
    if (kind === "agent_session") return `${agentName || "Agent"}`;
    return "定时任务历史";
  }, [kind, agentName]);

  // Auto-refresh every 10s while this page is open
  useEffect(() => {
    const id = setInterval(() => {
      reload();
    }, 10000);
    return () => clearInterval(id);
  }, [reload]);

  async function handleRun() {
    if (!selectedJobId || isRunning) return;
    setRunError("");
    setIsRunning(true);
    try {
      await api.runCronJob(selectedJobId);
      await reload();
    } catch (err) {
      setRunError(err.message || "触发失败");
    } finally {
      setIsRunning(false);
    }
  }

  if (loadingList && jobs.length === 0) {
    return (
      <div className="cron-history-page">
        <div className="cron-history-loading">
          <RefreshCw size={20} className="cron-spin" />
          加载中...
        </div>
      </div>
    );
  }

  if (error && jobs.length === 0) {
    return (
      <div className="cron-history-page">
        <div className="cron-history-error">{error}</div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="cron-history-page">
        <div className="cron-history-empty">当前对象暂无定时任务历史</div>
      </div>
    );
  }

  return (
    <div className="cron-history-page">
      <div className="cron-history-layout">
        {/* Left panel: job list */}
        <div className="cron-history-left">
          {onBack ? (
            <div className="cron-history-left__toolbar">
              <button
                className="icon-btn icon-btn--label cron-history-back-btn"
                type="button"
                onClick={onBack}
              >
                <ArrowLeft size={14} strokeWidth={2} />
                {backLabel}
                <ChevronDown size={12} strokeWidth={2} />
              </button>
            </div>
          ) : null}
          <div className="cron-history-left__head">
            <h3>
              <History size={16} />
              定时任务历史
            </h3>
            <div className="cron-history-left__actions">
              <button
                className="cron-history-run-btn"
                type="button"
                onClick={handleRun}
                disabled={!selectedJobId || isRunning || loadingList}
                title={selectedJobId ? "立即运行当前任务" : "请先选择一个任务"}
              >
                <Play size={13} fill="currentColor" />
                <span>{isRunning ? "运行中..." : "运行"}</span>
              </button>
              <button
                className="icon-btn"
                type="button"
                onClick={reload}
                disabled={loadingList || isRunning}
                title="刷新"
              >
                <RefreshCw size={14} className={loadingList ? "cron-spin" : ""} />
              </button>
            </div>
          </div>
          <div className="cron-history-left__sub">{scopeTitle}</div>
          {runError ? <div className="cron-history-error cron-history-error--inline">{runError}</div> : null}

          <div className="cron-job-list">
            {jobs.map((job) => (
              <button
                key={job.job_id}
                className={`cron-job-card ${selectedJobId === job.job_id ? "active" : ""}`}
                type="button"
                onClick={() => selectJob(job.job_id)}
              >
                <div className="cron-job-card__top">
                  <span className="cron-job-card__name">{job.name}</span>
                  <JobStatusDot status={job.last_status} enabled={job.enabled} isRunning={job.is_running} />
                </div>
                <div className="cron-job-card__schedule">{describeCron(job.schedule)}</div>
                {job.last_result_summary ? (
                  <div className="cron-job-card__summary">{job.last_result_summary}</div>
                ) : job.last_run_at ? (
                  <div className="cron-job-card__summary cron-job-card__summary--empty">
                    已执行，暂无输出摘要
                  </div>
                ) : (
                  <div className="cron-job-card__summary cron-job-card__summary--empty">
                    尚未执行
                  </div>
                )}
                <div className="cron-job-card__meta">
                  {job.last_run_at ? (
                    <span>最近执行: {formatDateTime(job.last_run_at)}</span>
                  ) : (
                    <span>无执行记录</span>
                  )}
                  <span>共 {job.run_count} 次</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel: detail */}
        <div className="cron-history-right">
          {selectedJob ? (
            <>
              <div className="cron-history-right__head">
                <div>
                  <h2>{selectedJob.name}</h2>
                  <div className="cron-history-right__meta">
                    <span>{describeCron(selectedJob.schedule)}</span>
                    <span className={selectedJob.enabled ? "cron-tag cron-tag--on" : "cron-tag cron-tag--off"}>
                      {selectedJob.enabled ? "启用" : "停用"}
                    </span>
                    {selectedJob.last_run_at && (
                      <span>最近执行: {formatDateTime(selectedJob.last_run_at)}</span>
                    )}
                  </div>
                </div>
              </div>

              {loadingDetail && !detail ? (
                <div className="cron-history-loading">
                  <RefreshCw size={18} className="cron-spin" />
                  加载详情...
                </div>
              ) : error ? (
                <div className="cron-history-error">{error}</div>
              ) : detail?.latest_group ? (
                <div className="cron-history-detail">
                  {/* Latest result card */}
                  <div className="cron-detail-section">
                    <h4>最近一次执行</h4>
                    <CronRunCard
                      group={detail.latest_group}
                      defaultExpanded
                      showEvents
                      threadId={detail.thread_id}
                      agentName={agentName || selectedJob.name}
                    />
                  </div>

                  {/* Group history */}
                  {detail.groups.length > 1 && (
                    <div className="cron-detail-section">
                      <h4>历史执行</h4>
                      <div className="cron-group-list">
                        {detail.groups.slice(1).map((group) => (
                          <CronRunCard
                            key={group.group_id}
                            group={group}
                            defaultExpanded={false}
                            showEvents
                            threadId={detail.thread_id}
                            agentName={agentName || selectedJob.name}
                          />
                        ))}
                      </div>
                      {appendError && (
                        <div className="cron-history-error cron-history-error--inline">
                          {appendError}
                        </div>
                      )}
                      {detail.next_cursor && (
                        <button
                          className="cron-load-more"
                          type="button"
                          onClick={loadMoreGroups}
                          disabled={loadingDetail}
                        >
                          {loadingDetail ? (
                            <>
                              加载中...
                              <RefreshCw size={12} className="cron-spin" />
                            </>
                          ) : (
                            <>
                              加载更多
                              <ChevronDown size={12} />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="cron-history-empty">
                  该任务尚无历史执行结果
                </div>
              )}
            </>
          ) : (
            <div className="cron-history-empty">请从左侧选择一个任务</div>
          )}
        </div>
      </div>
    </div>
  );
}
