import { useCallback, useMemo, useState } from "react";
import { openclawGateway } from "./openclawGateway";

export function useOpenClawCron() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await openclawGateway.rpc("cron.list", { limit: 100 });
      setJobs(result.jobs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const addJob = useCallback(async (job) => {
    setError("");
    try {
      const result = await openclawGateway.rpc("cron.add", job);
      setJobs((prev) => [...prev, result.job]);
      return result.job;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updateJob = useCallback(async (id, updates) => {
    setError("");
    try {
      const result = await openclawGateway.rpc("cron.update", { id, ...updates });
      setJobs((prev) => prev.map((j) => (j.id === id ? result.job : j)));
      return result.job;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const removeJob = useCallback(async (id) => {
    setError("");
    try {
      await openclawGateway.rpc("cron.remove", { id });
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const runJob = useCallback(async (id) => {
    setError("");
    try {
      await openclawGateway.rpc("cron.run", { id });
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return useMemo(() => ({
    jobs,
    loading,
    error,
    loadJobs,
    addJob,
    updateJob,
    removeJob,
    runJob,
  }), [jobs, loading, error, loadJobs, addJob, updateJob, removeJob, runJob]);
}
