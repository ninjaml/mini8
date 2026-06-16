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

function ToolCallMessage({ content }) {
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
    return (
      <div className="tool-panel tool-cat-file">
        <div className="tool-panel-header">🔧 Tool</div>
        <div className="tool-panel-content">{content}</div>
      </div>
    );
  }

  const { toolName, args } = parsed;

  // write_todos 使用特殊的 Panel 样式
  if (toolName === 'write_todos' && args.todos) {
    return <TodosToolDisplay todos={args.todos} />;
  }

  // 其他所有工具使用统一的 Shell 样式
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
          title: toolName,
          content: JSON.stringify(args, null, 2)
        };
    }
  };

  const toolInfo = getToolInfo();
  const category = getToolCategory(toolName);

  return (
    <div className={`tool-panel tool-cat-${category}`}>
      <div className="tool-panel-header">
        {toolInfo.icon} {toolInfo.title}
      </div>
      <div className="tool-panel-content">{toolInfo.content}</div>
    </div>
  );
}

export default ToolCallMessage;
