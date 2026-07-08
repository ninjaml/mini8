import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

const STORAGE_KEY = "camphor_cron_baseline_v1";
const POLL_INTERVAL = 30000;

function readBaselines() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeBaselines(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function buildBaseline(jobs) {
  const baseline = {};
  for (const job of jobs) {
    baseline[job.job_id] = {
      lastRunAt: job.last_run_at || null,
      runCount: job.run_count || 0,
    };
  }
  return baseline;
}

function checkUnread(jobs, baseline) {
  if (!baseline) return false;
  for (const job of jobs) {
    const b = baseline[job.job_id];
    if (!b) return true;
    if ((job.last_run_at || null) !== b.lastRunAt) return true;
    if ((job.run_count || 0) > b.runCount) return true;
  }
  return false;
}

function hasValidCronScope({ kind, agentSessionId }) {
  if (!kind) return false;
  if (kind === "agent_session") return agentSessionId != null;
  return kind === "moss";
}

export function useCronUnread({ kind, agentSessionId, enabled }) {
  const [hasUnread, setHasUnread] = useState(false);
  const jobsRef = useRef([]);
  const scopeIdentity = kind === "agent_session" ? agentSessionId : kind;
  const scopeKey = `${kind}:${scopeIdentity ?? "null"}`;
  const validScope = hasValidCronScope({ kind, agentSessionId });

  const markRead = useCallback(() => {
    setHasUnread(false);
    const baselines = readBaselines();
    baselines[scopeKey] = buildBaseline(jobsRef.current);
    writeBaselines(baselines);
  }, [scopeKey]);

  useEffect(() => {
    if (!enabled || !validScope) {
      setHasUnread(false);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const data = await api.getCronHistoryList({ kind, agentSessionId });
        const jobs = data.jobs || [];
        if (cancelled) return;
        jobsRef.current = jobs;

        const baselines = readBaselines();
        const baseline = baselines[scopeKey];

        if (!baseline) {
          baselines[scopeKey] = buildBaseline(jobs);
          writeBaselines(baselines);
          setHasUnread(false);
          return;
        }

        setHasUnread(checkUnread(jobs, baseline));
      } catch {
        // ignore polling errors
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [kind, agentSessionId, enabled, scopeKey, validScope]);

  return { hasUnread, markRead };
}

export function useCronUnreadMap(scopes, enabled) {
  const [unreadMap, setUnreadMap] = useState({});
  const jobsMapRef = useRef({});

  useEffect(() => {
    const validScopes = scopes.filter((scope) => hasValidCronScope(scope));
    if (!enabled || validScopes.length === 0) {
      setUnreadMap({});
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const baselines = readBaselines();
      const nextMap = {};

      await Promise.all(
        validScopes.map(async (scope) => {
          const scopeIdentity = scope.kind === "agent_session" ? scope.agentSessionId : scope.kind;
          const scopeKey = `${scope.kind}:${scopeIdentity ?? "null"}`;
          try {
            const data = await api.getCronHistoryList({
              kind: scope.kind,
              agentSessionId: scope.agentSessionId,
            });
            const jobs = data.jobs || [];
            jobsMapRef.current[scopeKey] = jobs;

            const baseline = baselines[scopeKey];
            if (!baseline) {
              baselines[scopeKey] = buildBaseline(jobs);
              nextMap[scopeKey] = false;
            } else {
              nextMap[scopeKey] = checkUnread(jobs, baseline);
            }
          } catch {
            // ignore polling errors for individual scopes
          }
        })
      );

      if (cancelled) return;
      writeBaselines(baselines);
      setUnreadMap(nextMap);
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [scopes, enabled]);

  const markRead = useCallback((scopeKey) => {
    const jobs = jobsMapRef.current[scopeKey];
    if (!jobs) return;
    const baselines = readBaselines();
    baselines[scopeKey] = buildBaseline(jobs);
    writeBaselines(baselines);
    setUnreadMap((prev) => ({ ...prev, [scopeKey]: false }));
  }, []);

  return { unreadMap, markRead };
}
