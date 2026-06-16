const ICON_COLORS = [
  "#7B68EE", "#4A90D9", "#E85D75", "#50C878",
  "#F5A623", "#5BC0DE", "#FF6B35", "#C850C0",
];

function renderIcon(item, index, entity) {
  const name =
    (entity === "skills"
      ? item.chinese_name || item.slug || ""
      : item.name || "") || (entity === "skills" ? "S" : "P");
  return (
    <div
      className="market-card-icon"
      style={{ backgroundColor: ICON_COLORS[index % ICON_COLORS.length] }}
    >
      <span>{name.slice(0, 1)}</span>
    </div>
  );
}

export default function CardGrid({ items, entity, empty, onOpenDetail }) {
  if (!items.length) {
    return (
      <section className="market-card-grid">
        <div className="market-empty-box">{empty}</div>
      </section>
    );
  }

  return (
    <section className="market-card-grid">
      {items.map((item, index) => {
        const title =
          entity === "skills"
            ? item.chinese_name || item.slug || `Skill #${item.id}`
            : item.name || `Prompt #${item.id}`;
        const desc = item.summary || "暂无描述";
        const meta = item.tags?.[0]?.name || "未分类";

        return (
          <article
            key={item.id}
            className="market-card"
            onClick={() => onOpenDetail?.(item)}
          >
            <div className="market-card-header">
              {renderIcon(item, index, entity)}
              <div className="market-card-title-wrap">
                <h3>{title}</h3>
              </div>
            </div>
            <p className="market-card-desc">{desc}</p>
            {entity === "prompts" && item.content && (
              <p className="market-card-snippet">{item.content}</p>
            )}
            <div className="market-card-footer">
              <span className="market-card-stat">
                <span className="market-card-stat-dot" />
                {meta}
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
