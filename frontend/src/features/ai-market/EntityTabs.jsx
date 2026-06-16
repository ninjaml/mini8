export default function EntityTabs({ active, onChange }) {
  const tabs = [
    { key: "skills", label: "AI资源包" },
    { key: "prompts", label: "提示词资源包" },
  ];

  return (
    <div className="market-entity-tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`market-entity-tab ${active === t.key ? "active" : ""}`}
          type="button"
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
