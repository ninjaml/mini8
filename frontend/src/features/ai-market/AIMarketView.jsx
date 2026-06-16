import { useState, useEffect, useMemo } from "react";
import { marketApi } from "./marketApi";
import { Modal } from "../../components/common/Modal";
import EntityTabs from "./EntityTabs";
import TagTabs from "./TagTabs";
import CardGrid from "./CardGrid";
import DetailModal from "./DetailModal";

const CONFIG = {
  skills: {
    title: "AI资源包",
    subtitle: "为 Agent 发现、安装可用技能。",
    empty: "没有匹配到 skill。",
    searchPlaceholder: "搜索 slug / 中文名 / 摘要...",
    searchFields: [
      { value: "", label: "全部字段" },
      { value: "slug", label: "slug" },
      { value: "chinese_name", label: "中文名" },
      { value: "summary", label: "摘要" },
    ],
  },
  prompts: {
    title: "提示词资源包",
    subtitle: "为 Agent 发现、安装可用提示词。",
    empty: "没有匹配到 prompt。",
    searchPlaceholder: "搜索名称 / 摘要 / 正文...",
    searchFields: [
      { value: "", label: "全部字段" },
      { value: "name", label: "名称" },
      { value: "summary", label: "摘要" },
      { value: "content", label: "正文" },
    ],
  },
};

export function AIMarketView() {
  const [allSkills, setAllSkills] = useState([]);
  const [allPrompts, setAllPrompts] = useState([]);
  const [tags, setTags] = useState([]);
  const [activeEntity, setActiveEntity] = useState("skills");
  const [keyword, setKeyword] = useState("");
  const [queryField, setQueryField] = useState("");
  const [activeTagId, setActiveTagId] = useState("");
  const [baseError, setBaseError] = useState("");
  const [promptError, setPromptError] = useState("");
  const [detailItem, setDetailItem] = useState(null);
  const [downloadError, setDownloadError] = useState("");
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [promptsLoaded, setPromptsLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBaseData() {
      setLoadingBase(true);
      setBaseError("");
      try {
        const [skills, tagList] = await Promise.all([
          marketApi.getSkills({ signal: controller.signal }),
          marketApi.getTags({ signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setAllSkills(skills || []);
        setTags(tagList || []);
      } catch (e) {
        if (e.name === "AbortError") return;
        setBaseError(e.message || "加载资源包失败");
      } finally {
        if (!controller.signal.aborted) {
          setLoadingBase(false);
        }
      }
    }

    loadBaseData();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setActiveTagId("");
  }, [activeEntity]);

  useEffect(() => {
    if (activeEntity !== "prompts" || promptsLoaded) return undefined;

    const controller = new AbortController();

    async function loadPrompts() {
      setLoadingPrompts(true);
      setPromptError("");
      try {
        const prompts = await marketApi.getPrompts({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setAllPrompts(prompts || []);
        setPromptsLoaded(true);
      } catch (e) {
        if (e.name === "AbortError") return;
        setPromptError(e.message || "加载提示词资源包失败");
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPrompts(false);
        }
      }
    }

    loadPrompts();
    return () => controller.abort();
  }, [activeEntity, promptsLoaded]);

  const currentItems = activeEntity === "skills" ? allSkills : allPrompts;
  const config = CONFIG[activeEntity];
  const error = activeEntity === "prompts" ? promptError || baseError : baseError;
  const loading = loadingBase || (activeEntity === "prompts" && !promptsLoaded && loadingPrompts);

  const filteredItems = useMemo(() => {
    let items = [...currentItems];
    if (keyword) {
      const k = keyword.toLowerCase();
      items = items.filter((item) => {
        if (activeEntity === "skills") {
          const targets = queryField
            ? [item[queryField] || ""]
            : [item.slug, item.chinese_name, item.summary];
          return targets.some((t) => (t || "").toLowerCase().includes(k));
        }
        const targets = queryField
          ? [item[queryField] || ""]
          : [item.name, item.summary, item.content];
        return targets.some((t) => (t || "").toLowerCase().includes(k));
      });
    }
    if (activeTagId) {
      items = items.filter((item) =>
        (item.tags || []).some((tag) => String(tag.id) === String(activeTagId))
      );
    }
    items.sort((a, b) => (b.id || 0) - (a.id || 0));
    return items;
  }, [currentItems, keyword, queryField, activeTagId, activeEntity]);

  const handleDownload = async (skillId, slug) => {
    try {
      await marketApi.downloadSkill(skillId, slug);
    } catch (e) {
      setDownloadError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="ai-market-view">
        <div className="market-loading">
          <div className="market-loading-spinner" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-market-view">
      <header className="market-header">
        <div className="market-header-main">
          <div>
            <h1>{config.title}</h1>
            <p className="market-subtitle">{config.subtitle}</p>
          </div>
        </div>
      </header>

      <section className="market-controls">
        <div className="market-toolbar market-toolbar--inline market-toolbar--compact">
          <div className="market-search-wrap market-search-wrap--grow">
            <select
              className="market-search-select"
              value={queryField}
              onChange={(e) => setQueryField(e.target.value)}
            >
              {config.searchFields.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <input
              className="market-search-input"
              placeholder={config.searchPlaceholder}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <EntityTabs active={activeEntity} onChange={setActiveEntity} />
        </div>
        <div className="market-nav-wrap market-nav-wrap--flush market-nav-wrap--full">
          <TagTabs
            tags={tags}
            activeTagId={activeTagId}
            items={currentItems}
            onChange={setActiveTagId}
          />
        </div>
      </section>

      {error && (
        <section className="market-error">
          <div className="market-error-box">{error}</div>
        </section>
      )}

      <section className="market-summary">
        <span>{filteredItems.length}</span>
        <span>个可用资源</span>
      </section>

      <CardGrid
        items={filteredItems}
        entity={activeEntity}
        empty={config.empty}
        onOpenDetail={setDetailItem}
      />

      <DetailModal
        item={detailItem}
        entity={activeEntity}
        onClose={() => setDetailItem(null)}
        onDownload={handleDownload}
      />

      <Modal open={!!downloadError} onClose={() => setDownloadError("")}>
        <div className="market-modal-header">
          <h2>获取失败</h2>
          <button className="market-modal-close" type="button" onClick={() => setDownloadError("")}>
            ✕
          </button>
        </div>
        <div className="market-detail-content">
          <p style={{ color: "#dc2626", margin: 0 }}>{downloadError}</p>
        </div>
      </Modal>
    </div>
  );
}
