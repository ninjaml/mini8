import { useEffect, useState, useMemo, useCallback } from "react";
import { sceneApi } from "./sceneApi";
import { SceneImage } from "./SceneImage";
import { SceneCoverImage } from "./SceneCoverImage";
import { Modal } from "../../components/common/Modal";
import "./scene.css";

const SCENARIO_COLORS = [
  { bg: "#6366f1", light: "rgba(99,102,241,0.12)" },
  { bg: "#3b82f6", light: "rgba(59,130,246,0.12)" },
  { bg: "#f43f5e", light: "rgba(244,63,94,0.12)" },
  { bg: "#10b981", light: "rgba(16,185,129,0.12)" },
  { bg: "#f59e0b", light: "rgba(245,158,11,0.12)" },
  { bg: "#0ea5e9", light: "rgba(14,165,233,0.12)" },
  { bg: "#8b5cf6", light: "rgba(139,92,246,0.12)" },
  { bg: "#ec4899", light: "rgba(236,72,153,0.12)" },
  { bg: "#14b8a6", light: "rgba(20,184,166,0.12)" },
  { bg: "#f97316", light: "rgba(249,115,22,0.12)" },
];

function getScenarioColor(id) {
  return SCENARIO_COLORS[Math.abs(id || 0) % SCENARIO_COLORS.length];
}

function getScenarioIconText(scenario) {
  return scenario.chinese_name?.[0] || scenario.slug?.[0] || "场";
}

export default function ScenePage() {
  const [viewMode, setViewMode] = useState("list");
  const [scenarios, setScenarios] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [activeTagId, setActiveTagId] = useState("");
  const [sortMode, setSortMode] = useState("hottest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [alertModal, setAlertModal] = useState({ open: false, message: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [scenarioList, tagList] = await Promise.all([
        sceneApi.getScenarios(),
        sceneApi.getTags(),
      ]);
      setScenarios(scenarioList);
      setTags(tagList);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 客户端过滤 + 排序
  const filteredScenarios = useMemo(() => {
    let items = [...scenarios];
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      items = items.filter((s) => {
        const targets = [s.slug, s.chinese_name, s.summary, s.description];
        return targets.some((t) => (t || "").toLowerCase().includes(k));
      });
    }
    if (activeTagId) {
      items = items.filter((s) =>
        (s.tags || []).some((t) => String(t.id) === String(activeTagId))
      );
    }
    if (sortMode === "hottest") {
      items.sort((a, b) => (b.download_count || 0) - (a.download_count || 0));
    } else {
      items.sort((a, b) => (b.id || 0) - (a.id || 0));
    }
    return items;
  }, [scenarios, keyword, activeTagId, sortMode]);

  function openDetail(scenario) {
    setSelectedScenario(scenario);
    setViewMode("detail");
  }

  function backToList() {
    setViewMode("list");
    setSelectedScenario(null);
    setLightboxIndex(null);
  }

  const currentImages = selectedScenario ? selectedScenario.images || [] : [];

  if (loading) {
    return (
      <div className="scene-page">
        <div className="scene-loading">正在加载场景...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="scene-page">
        <div className="scene-error">加载失败: {error}</div>
      </div>
    );
  }

  return (
    <div className="scene-page">
      {/* Lightbox */}
      {lightboxIndex !== null && currentImages.length > 0 && selectedScenario && (
        <div className="scene-lightbox" onClick={() => setLightboxIndex(null)}>
          <button
            className="scene-lightbox-close"
            onClick={() => setLightboxIndex(null)}
          >
            ✕
          </button>
          <button
            className="scene-lightbox-nav scene-lightbox-prev"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex(
                lightboxIndex > 0 ? lightboxIndex - 1 : currentImages.length - 1
              );
            }}
          >
            ‹
          </button>
          <SceneImage
            src={sceneApi.getImageUrl(
              selectedScenario.id,
              currentImages[lightboxIndex].id
            )}
            fallback="图"
            className="scene-lightbox-img"
          />
          <button
            className="scene-lightbox-nav scene-lightbox-next"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex(
                lightboxIndex < currentImages.length - 1
                  ? lightboxIndex + 1
                  : 0
              );
            }}
          >
            ›
          </button>
          <div className="scene-lightbox-counter">
            {lightboxIndex + 1} / {currentImages.length}
          </div>
        </div>
      )}

      {viewMode === "list" && (
        <div className="scene-list-view">
          <div className="scene-list-header">
            <div>
              <h2>场景案例</h2>
              <p className="scene-list-subtitle">
                按业务分类浏览场景案例，一键启动自动化工作流
              </p>
            </div>
            <div className="scene-sort-toggle">
              <button
                className={sortMode === "hottest" ? "active" : ""}
                onClick={() => setSortMode("hottest")}
              >
                最热
              </button>
              <button
                className={sortMode === "newest" ? "active" : ""}
                onClick={() => setSortMode("newest")}
              >
                最新
              </button>
            </div>
          </div>

          <div className="scene-list-toolbar">
            <input
              className="scene-search-input"
              placeholder="搜索场景..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <div className="scene-tag-filter">
              <button
                className={activeTagId === "" ? "active" : ""}
                onClick={() => setActiveTagId("")}
              >
                全部
              </button>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className={activeTagId === String(tag.id) ? "active" : ""}
                  onClick={() => setActiveTagId(String(tag.id))}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="scene-summary">
            <span>{filteredScenarios.length}</span>
            <span> 个场景</span>
          </div>

          <div className="scene-card-grid">
            {filteredScenarios.map((scenario) => {
              const color = getScenarioColor(scenario.id);
              const iconText = getScenarioIconText(scenario);
              return (
                <article
                  key={scenario.id}
                  className="scene-card"
                  onClick={() => openDetail(scenario)}
                >
                  <div className="scene-card-top">
                    <div
                      className="scene-card-icon"
                      style={{ background: color.bg }}
                    >
                      {iconText}
                    </div>
                    <div className="scene-card-cover">
                      {scenario.cover_url ? (
                        <SceneCoverImage
                          src={scenario.cover_url}
                          fallback={iconText}
                          className="scene-card-cover-img"
                        />
                      ) : (
                        <div className="scene-card-cover-placeholder">
                          {iconText}
                        </div>
                      )}
                    </div>
                  </div>
                  <h3>
                    {scenario.chinese_name ||
                      scenario.slug ||
                      `场景 #${scenario.id}`}
                  </h3>
                  <p>{scenario.summary || "暂无描述"}</p>
                  <div className="scene-card-footer">
                    <span className="scene-card-usage">
                      {scenario.download_count || 0} 次使用
                    </span>
                    <div className="scene-card-hover-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(scenario);
                        }}
                      >
                        查看
                      </button>
                      {scenario.channel_url && (
                        <a
                          href={scenario.channel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          去频道
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {filteredScenarios.length === 0 && (
            <div className="scene-empty">没有匹配到场景。</div>
          )}
        </div>
      )}

      {viewMode === "detail" && selectedScenario && (
        <div className="scene-detail-canvas">
          <button className="scene-back-btn" onClick={backToList}>
            ← 返回场景列表
          </button>

          <div className="scene-detail-card">
            <div className="scene-detail-hero">
              {selectedScenario.cover_url ? (
                <SceneCoverImage
                  src={selectedScenario.cover_url}
                  fallback="场"
                  className="scene-detail-hero-img"
                />
              ) : (
                <div className="scene-detail-hero-placeholder">场</div>
              )}
              <div className="scene-detail-hero-overlay" />
              <div className="scene-detail-hero-content">
                <div
                  className="scene-detail-hero-icon"
                  style={{ background: getScenarioColor(selectedScenario.id).bg }}
                >
                  {getScenarioIconText(selectedScenario)}
                </div>
                <div className="scene-detail-hero-text">
                  <div className="scene-detail-hero-category">
                    {(selectedScenario.tags || [])
                      .map((t) => t.name)
                      .join(" · ") || "—"}
                  </div>
                  <div className="scene-detail-hero-title">
                    {selectedScenario.chinese_name ||
                      selectedScenario.slug ||
                      `场景 #${selectedScenario.id}`}
                  </div>
                </div>
              </div>
            </div>

            <div className="scene-detail-body">
              <div className="scene-detail-header-row">
                <div className="scene-detail-tags">
                  {selectedScenario.tags?.map((t) => (
                    <span key={t.id} className="scene-tag-pill">
                      {t.name}
                    </span>
                  ))}
                </div>
                <span className="scene-detail-usage">
                  使用 <strong>{selectedScenario.download_count || 0}</strong> 次
                </span>
              </div>

              <p className="scene-detail-desc">
                {selectedScenario.description ||
                  selectedScenario.summary ||
                  "暂无描述"}
              </p>

              <div className="scene-detail-actions">
                <button
                  className="scene-btn-primary"
                  onClick={async () => {
                    try {
                      await sceneApi.downloadScenario(
                        selectedScenario.id,
                        selectedScenario.slug || selectedScenario.chinese_name
                      );
                    } catch (e) {
                      setAlertModal({ open: true, message: e.message || "下载失败" });
                    }
                  }}
                >
                  下载场景包
                </button>
                {selectedScenario.channel_url && (
                  <a
                    href={selectedScenario.channel_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="scene-btn-outline"
                  >
                    去频道
                  </a>
                )}
              </div>

              {selectedScenario.images?.length > 0 && (
                <div className="scene-detail-gallery">
                  <h3>场景图片</h3>
                  <div className="scene-gallery-grid">
                    {selectedScenario.images.map((img, idx) => (
                      <div
                        key={img.id}
                        className="scene-gallery-item"
                        onClick={() => setLightboxIndex(idx)}
                      >
                        <SceneImage
                          src={sceneApi.getImageUrl(
                            selectedScenario.id,
                            img.id
                          )}
                          fallback="图"
                          className="scene-gallery-img"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 提示弹窗 */}
      <Modal open={alertModal.open} onClose={() => setAlertModal({ open: false, message: "" })}>
        <div style={{ padding: "24px", minWidth: 280 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#111827" }}>提示</h3>
          <p style={{ margin: "0 0 20px 0", fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>
            {alertModal.message}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="scene-btn-primary"
              onClick={() => setAlertModal({ open: false, message: "" })}
              style={{ minWidth: 80 }}
            >
              确定
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
