import { useState } from 'react';
import TodosToolDisplay from './TodosToolDisplay';
import './ToolDisplay.css';

// 工具分类
const getToolCategory = (toolName) => {
  const categories = {
    file: ['ls', 'read_file', 'write_file', 'edit_file', 'glob', 'grep'],
    exec: ['shell', 'execute'],
    network: ['web_search', 'fetch_url', 'http_request'],
    task: ['write_todos', 'task'],
  };
  for (const [cat, tools] of Object.entries(categories)) {
    if (tools.includes(toolName)) return cat;
  }
  return 'file'; // 默认归为文件类
};

const TOOL_PREVIEW_MAX_CHARS = 220;
const TOOL_PREVIEW_MAX_LINES = 5;

// 长工具参数/结果默认只展示一个短摘要，避免聊天区被大段 JSON 撑开。
function buildPreviewText(text) {
  if (typeof text !== 'string' || !text.trim()) return '';
  const lines = text.split('\n');
  const limitedLines = lines.slice(0, TOOL_PREVIEW_MAX_LINES);
  let preview = limitedLines.join('\n');
  if (preview.length > TOOL_PREVIEW_MAX_CHARS) {
    preview = `${preview.slice(0, TOOL_PREVIEW_MAX_CHARS)}...`;
  } else if (lines.length > TOOL_PREVIEW_MAX_LINES) {
    preview = `${preview}...`;
  }
  return preview;
}

// 用“字符数 + 行数”双阈值判断是否应该折叠，兼顾长单行和长多行两种情况。
function shouldCollapseToolContent(text) {
  if (typeof text !== 'string') return false;
  const normalized = text.trim();
  if (!normalized) return false;
  if (normalized.length > TOOL_PREVIEW_MAX_CHARS) return true;
  return normalized.split('\n').length > TOOL_PREVIEW_MAX_LINES;
}

// 某些 tool_result 会直接返回一整段 JSON 字符串，先格式化一下，展开后更容易读。
function formatToolText(text) {
  if (typeof text !== 'string') return String(text ?? '');
  const normalized = text.trim();
  if (!normalized) return text;
  if (!normalized.startsWith('{') && !normalized.startsWith('[')) {
    return text;
  }
  try {
    return JSON.stringify(JSON.parse(normalized), null, 2);
  } catch (_error) {
    return text;
  }
}

function ToolCallMessage({ content, metadata = null }) {
  const [expanded, setExpanded] = useState(false);
  const metadataToolName = metadata?.tool_name || '';

  // 解析工具调用: "tool_name: tool_name({...})"
  const parseToolCall = (content) => {
    const match = content.match(/(\w+):\s*\1\((.*)\)/);
    if (!match) return null;

    const [, toolName, argsJson] = match;
    try {
      const args = JSON.parse(argsJson);
      return { toolName, args };
    } catch (e) {
      console.error('Failed to parse tool call:', e);
      return null;
    }
  };

  const parsed = parseToolCall(content);

  // 如果解析失败，显示原始内容
  if (!parsed) {
    // 这里通常是 tool_result 或后端透传的原始文本，尽量根据 metadata 还原工具名和配色。
    const fallbackText = formatToolText(
      typeof content === 'string' ? content : String(content ?? ''),
    );
    const shouldCollapse = shouldCollapseToolContent(fallbackText);
    const previewText = buildPreviewText(fallbackText);
    const fallbackTitle = metadataToolName || 'Tool';
    const fallbackCategory = getToolCategory(metadataToolName);

    return (
      <div className={`tool-panel tool-cat-${fallbackCategory}`}>
        <button
          type="button"
          className={`tool-panel-header tool-panel-header--toggle ${expanded ? 'is-expanded' : ''}`}
          onClick={() => shouldCollapse && setExpanded((value) => !value)}
          disabled={!shouldCollapse}
        >
          <span>🔧 {fallbackTitle}</span>
          {shouldCollapse ? (
            <span className="tool-panel-arrow">{expanded ? '▲' : '▼'}</span>
          ) : null}
        </button>
        {shouldCollapse && !expanded ? (
          <div className="tool-panel-preview">{previewText}</div>
        ) : (
          <div className="tool-panel-content">{fallbackText}</div>
        )}
      </div>
    );
  }

  const { toolName, args } = parsed;

  // write_todos 使用特殊的 Panel 样式
  if (toolName === 'write_todos' && args.todos) {
    return <TodosToolDisplay todos={args.todos} />;
  }

  // 其他工具统一映射成“标题 + 一段可读摘要”，不要把整个原始参数直接砸进聊天区。
  const getToolInfo = () => {
    switch (toolName) {
      case 'shell':
        return {
          icon: '💻',
          title: 'Shell',
          content: `$ ${args.command || ''}`
        };
      case 'read_file':
        return {
          icon: '📖',
          title: 'Read File',
          content: args.path || ''
        };
      case 'write_file':
        return {
          icon: '📝',
          title: 'Write File',
          content: args.path || ''
        };
      case 'edit_file':
        return {
          icon: '✏️',
          title: 'Edit File',
          content: args.path || ''
        };
      case 'http_request':
        return {
          icon: '🌐',
          title: 'HTTP Request',
          content: `${args.method || 'GET'} ${args.url || ''}`
        };
      case 'web_search':
        return {
          icon: '🔍',
          title: 'Web Search',
          content: args.query || ''
        };
      case 'fetch_url':
        return {
          icon: '🌍',
          title: 'Fetch URL',
          content: args.url || ''
        };
      case 'glob':
        return {
          icon: '🔎',
          title: 'Glob Search',
          content: args.pattern || ''
        };
      case 'grep':
        return {
          icon: '🔦',
          title: 'Grep Search',
          content: `pattern: "${args.pattern || ''}" in ${args.path || ''}`
        };
      default:
        return {
          icon: '🔧',
          title: metadataToolName || toolName,
          content: JSON.stringify(args, null, 2)
        };
    }
  };

  const toolInfo = getToolInfo();
  const category = getToolCategory(metadataToolName || toolName);
  const shouldCollapse = shouldCollapseToolContent(toolInfo.content);
  const previewText = buildPreviewText(toolInfo.content);

  return (
    <div className={`tool-panel tool-cat-${category}`}>
      <button
        type="button"
        className={`tool-panel-header tool-panel-header--toggle ${expanded ? 'is-expanded' : ''}`}
        onClick={() => shouldCollapse && setExpanded((value) => !value)}
        disabled={!shouldCollapse}
      >
        <span>{toolInfo.icon} {toolInfo.title}</span>
        {shouldCollapse ? (
          <span className="tool-panel-arrow">{expanded ? '▲' : '▼'}</span>
        ) : null}
      </button>
      {shouldCollapse && !expanded ? (
        <div className="tool-panel-preview">{previewText}</div>
      ) : (
        <div className="tool-panel-content">{toolInfo.content}</div>
      )}
    </div>
  );
}

export default ToolCallMessage;
