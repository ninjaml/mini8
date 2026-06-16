import { useCallback, useMemo, useState } from "react";
import { openclawGateway } from "./openclawGateway";

export function useOpenClawData() {
  const [agents, setAgents] = useState([]);
  const [models, setModels] = useState([]);
  const [tools, setTools] = useState([]);
  const [toolGroups, setToolGroups] = useState([]);
  const [skills, setSkills] = useState([]);
  const [defaultId, setDefaultId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [agentsRes, modelsRes, toolsRes, skillsRes, channelsRes] = await Promise.all([
        openclawGateway.rpc("agents.list").catch((e) => ({ _err: e.message, agents: [] })),
        openclawGateway.rpc("models.list").catch((e) => ({ _err: e.message, models: [] })),
        openclawGateway.rpc("tools.catalog").catch((e) => ({ _err: e.message, tools: [] })),
        openclawGateway.rpc("skills.status").catch((e) => ({ _err: e.message, skills: [] })),
        openclawGateway.rpc("channels.status").catch((e) => ({ _err: e.message, channels: [] })),
      ]);

      setAgents(agentsRes.agents || []);
      setDefaultId(agentsRes.defaultId || null);
      setModels(modelsRes.models || []);
      // tools.catalog 返回 {agentId, profiles, groups}
      const groups = toolsRes.groups || [];
      setToolGroups(groups);
      const flatTools = groups.flatMap((g) =>
        (g.tools || []).map((t) => ({
          ...t,
          groupId: g.id,
          groupLabel: g.label,
          groupSource: g.source,
        }))
      );
      setTools(flatTools);
      setSkills(skillsRes.skills || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleSkill = useCallback(async (skillName, enabled) => {
    try {
      await openclawGateway.rpc("skills.update", { name: skillName, enabled });
      setSkills((prev) =>
        prev.map((s) => (s.name === skillName ? { ...s, enabled } : s))
      );
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return useMemo(() => ({
    agents,
    defaultId,
    models,
    tools,
    toolGroups,
    skills,
    loading,
    error,
    loadAll,
    toggleSkill,
  }), [agents, defaultId, models, tools, toolGroups, skills, loading, error, loadAll, toggleSkill]);
}
