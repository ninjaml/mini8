import './Tooltip.css';

export function Tooltip({ children, text, direction = 'down' }) {
  return (
    <span className={`tooltip-wrapper tooltip-${direction}`}>
      {children}
      <span className="tooltip-text">{text}</span>
    </span>
  );
}
