import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

export function useCronHistory({ kind, targetId, defaultJobId }) {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [appendError, setAppendError] = useState("");

  const scopeKey = `${kind}:${targetId ?? "null"}`;

  const reloadList = useCallback(async () => {
    setLoadingList(true);
    setError("");
    setAppendError("");
    try {
      const data = await api.getCronHistoryList({ kind, targetId });
      const newJobs = data.jobs || [];
      setJobs(newJobs);
      const defaultId = (defaultJobId && newJobs.some((j) => j.job_id === defaultJobId))
        ? defaultJobId
        : (data.default_job_id || (newJobs[0]?.job_id ?? null));
      setSelectedJobId((prev) => {
        if (prev != null && newJobs.some((j) => j.job_id === prev)) {
          return prev;
        }
        return defaultId;
      });
    } catch (err) {
      setError(err.message || "加载定时任务历史失败");
      setJobs([]);
    } finally {
      setLoadingList(false);
    }
  }, [kind, targetId, defaultJobId]);

  const loadDetail = useCallback(
    async (jobId, { beforeCursor } = {}) => {
      if (!jobId) {
        setDetail(null);
        return;
      }
      if (!beforeCursor) {
        setLoadingDetail(true);
        setError("");
        setDetail(null);
      }
      setAppendError("");
      try {
        const data = await api.getCronHistoryJobDetail(jobId, {
          kind,
          targetId,
          groupLimit: 20,
          beforeCursor,
        });
        if (beforeCursor) {
          // Append older groups for pagination, dedupe by group_id.
          // Preserve prev.latest_group so it always reflects the globally newest group.
          setDetail((prev) => {
            if (!prev || prev.job_id !== data.job_id) return data;
            const seen = new Set(prev.groups.map((g) => g.group_id));
            const newGroups = data.groups.filter((g) => !seen.has(g.group_id));
            return {
              ...data,
              latest_group: prev.latest_group,
              groups: [...prev.groups, ...newGroups],
            };
          });
        } else {
          setDetail(data);
        }
      } catch (err) {
        if (beforeCursor) {
          setAppendError(err.message || "加载更多历史失败");
        } else {
          setError(err.message || "加载任务详情失败");
        }
      } finally {
        setLoadingDetail(false);
      }
    },
    [kind, targetId]
  );

  const selectJob = useCallback(
    (jobId) => {
      setSelectedJobId(jobId);
      loadDetail(jobId);
    },
    [loadDetail]
  );

  const reload = useCallback(async () => {
    if (loadingList || loadingDetail) return;
    await reloadList();
    // Explicitly reload detail for the currently selected job so the right
    // panel refreshes even when selectedJobId does not change.
    if (selectedJobId) {
      loadDetail(selectedJobId);
    }
  }, [reloadList, selectedJobId, loadDetail, loadingList, loadingDetail]);

  // Auto-load list when scope changes
  useEffect(() => {
    setJobs([]);
    setSelectedJobId(null);
    setDetail(null);
    setError("");
    reloadList();
  }, [scopeKey, reloadList]);

  // Auto-load detail when selected job changes
  useEffect(() => {
    if (selectedJobId) {
      loadDetail(selectedJobId);
    } else {
      setDetail(null);
    }
  }, [selectedJobId, loadDetail]);

  const selectedJob = jobs.find((j) => j.job_id === selectedJobId) || null;

  const loadMoreGroups = useCallback(() => {
    if (!detail?.next_cursor || loadingDetail) return;
    loadDetail(selectedJobId, { beforeCursor: detail.next_cursor });
  }, [detail, loadingDetail, selectedJobId, loadDetail]);

  return {
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
  };
}