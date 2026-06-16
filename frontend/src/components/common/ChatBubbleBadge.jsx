export function ChatBubbleBadge({ className }) {
  return (
    <span className={className} aria-hidden="true">
      <svg width="20" height="16" viewBox="0 0 20 16" fill="none" style={{ display: "block" }}>
        <path
          d="M4 1.5h12A2.5 2.5 0 0 1 18.5 4v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 3 1.5-3H4A2.5 2.5 0 0 1 1.5 11V4A2.5 2.5 0 0 1 4 1.5z"
          fill="#10b981"
        />
        <circle cx="7.5" cy="7.5" r="1" fill="#fff" />
        <circle cx="10" cy="7.5" r="1" fill="#fff" />
        <circle cx="12.5" cy="7.5" r="1" fill="#fff" />
      </svg>
    </span>
  );
}
