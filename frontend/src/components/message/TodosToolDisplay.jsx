import { useState } from 'react';
import './ToolDisplay.css';

function TodosToolDisplay({ todos }) {
  const [expanded, setExpanded] = useState(false);

  const stats = {
    completed: todos.filter(t => t.status === 'completed').length,
    inProgress: todos.filter(t => t.status === 'in_progress').length,
    pending: todos.filter(t => t.status === 'pending').length,
    total: todos.length
  };

  const progress = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  const displayTodos = expanded ? todos : todos.slice(0, 5);

  return (
    <div className="todos-tool">
      <div className="tool-header">
        <span className="tool-title">📝 写入待办事项</span>
        <span className="tool-count">{stats.total}项</span>
      </div>

      <div className="todos-list">
        {displayTodos.map((todo, i) => (
          <div key={i} className={`todo-item status-${todo.status}`}>
            <span className="todo-icon">
              {todo.status === 'completed' ? '✓' :
               todo.status === 'in_progress' ? '⏳' : '○'}
            </span>
            <span className="todo-content">{todo.content}</span>
          </div>
        ))}
      </div>

      {todos.length > 5 && (
        <button
          className="expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起' : `展开查看全部 (${todos.length - 5}项未显示)`}
        </button>
      )}

      <div className="progress-section">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{width: `${progress}%`}}
          />
        </div>
        <span className="progress-text">
          进度: {stats.completed}/{stats.total} ({Math.round(progress)}%)
        </span>
      </div>
    </div>
  );
}

export default TodosToolDisplay;
