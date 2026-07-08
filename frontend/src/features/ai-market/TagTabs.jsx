export default function TagTabs({ tags, activeTagId, items, onChange }) {
  const counts = {};
  items.forEach((item) => {
    (item.tags || []).forEach((tag) => {
      counts[tag.id] = (counts[tag.id] || 0) + 1;
    });
  });

  const tabs = [
    { id: "", label: "全部", count: items.length },
    ...tags.map((tag) => ({
      id: String(tag.id),
      label: tag.name,
      count: counts[tag.id] || 0,
    })),
  ];

  return (
    <div className="market-tag-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`market-tag-tab ${String(activeTagId) === String(tab.id) ? "active" : ""}`}
          type="button"
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          <span className="market-tag-count">({tab.count})</span>
        </button>
      ))}
    </div>
  );
}
