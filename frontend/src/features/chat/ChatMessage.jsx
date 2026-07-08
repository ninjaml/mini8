import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CornerUpLeft, FileSearch } from 'lucide-react';
import ToolCallMessage from '../../components/message/ToolCallMessage';
import FileOperationDisplay from '../../components/message/FileOperationDisplay';
import TodosToolDisplay from '../../components/message/TodosToolDisplay';
import { Tooltip } from '../../components/common/Tooltip';
import { SubagentExecutionCard } from './SubagentExecutionCard';
import './Message.css';

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

function ThinkingMessage({ content, streaming, agentName = "MOSS" }) {
  const [expanded, setExpanded] = useState(false);
  const preview = typeof content === "string"
    ? content.length > 120
      ? `${content.slice(0, 120)}...`
      : content
    : "";

  return (
    <div className="message message-thinking">
      <div
        className={`thinking-toggle ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="thinking-header">
          <span className={`thinking-icon ${streaming ? 'pulsing' : ''}`}>✦</span>
          <span className="thinking-label">{agentName} is thinking{streaming ? '...' : ''}</span>
          <span className="thinking-arrow">{expanded ? '▲' : '▼'}</span>
        </span>
        {expanded && (
          <div className="thinking-body">{content}</div>
        )}
        {!expanded && preview ? (
          <div className="thinking-preview">{preview}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ChatMessage({ message, streaming, onImageClick, onRollback, canRollback, agentName = "MOSS", onInspectExecution = null }) {
  // 统一读取消息类型字段：优先 type，其次 role
  const messageType = message.type || message.role;
  const content = message.content;
  const resolvedAgentName = message.agentName || agentName;
  const targetAgentName = message.targetAgentName || null;

  // 辅助函数：提取 <think></think>标签中的 thinking 内容
  const extractThinking = (text) => {
    if (!text || typeof text !== 'string') return null;
    const thinkStart = '<think>';
    const thinkEnd = '</think>';
    const startIndex = text.indexOf(thinkStart);
    const endIndex = text.indexOf(thinkEnd);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const thinking = text.substring(startIndex + thinkStart.length, endIndex).trim();
      const content = text.replace(`${text.substring(startIndex, endIndex + thinkEnd.length)}`, '').trim();
      return {
        thinking,
        content
      };
    }
    return null;
  };

  // 子 Agent 卡片内部仍然复用同一个 ChatMessage 渲染链，
  // 这样卡片里的 thinking / tool / assistant 表现会和主聊天区保持一致。
  if (messageType === 'subagent_execution_card') {
    return (
      <div className="message message-assistant message-subagent">
        <div className="message-avatar message-avatar--ghost" aria-hidden="true" />
        <div className="message-content message-content--subagent">
          <SubagentExecutionCard
            card={message}
            onInspectExecution={onInspectExecution}
            renderMessage={(innerMessage, innerStreaming) => (
              <ChatMessage
                message={innerMessage}
                streaming={innerStreaming}
                onImageClick={onImageClick}
                onRollback={onRollback}
                canRollback={false}
                agentName={message.subagentType || resolvedAgentName}
                onInspectExecution={null}
              />
            )}
          />
        </div>
      </div>
    );
  }

  if (messageType === 'user') {
    const atts = message.attachments || [];
    return (
      <div className="message message-user">
        <div className="message-content-wrapper">
          {atts.length > 0 && (
            <div className="message-attachments">
              {atts.map((att, i) => {
                if (att.type === 'image') {
                  return (
                    <img
                      key={i}
                      src={att.url}
                      alt={att.name || '图片'}
                      className="message-image clickable"
                      onClick={() => onImageClick && onImageClick(att.url)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && onImageClick) {
                          e.preventDefault();
                          onImageClick(att.url);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                } else {
                  return (
                    <div key={i} className="message-document-tag">
                      <span className="document-icon">📄</span>
                      <span className="document-name">{att.name || '文档'}</span>
                    </div>
                  );
                }
              })}
            </div>
          )}
          <div className="message-content-row">
            {canRollback && onRollback && (
              <Tooltip text="回滚到此消息之前">
                <button
                  className="rollback-button"
                  onClick={() => onRollback(message.id)}
                  aria-label="回滚到此消息之前，将删除此消息及之后的所有对话"
                  role="button"
                >
                  <CornerUpLeft size={14} strokeWidth={2} />
                </button>
              </Tooltip>
            )}
            <div className="message-content">
              {targetAgentName ? <div className="message-user-target">@{targetAgentName}</div> : null}
              <div className="message-user-body">{content}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (messageType === 'assistant') {
    const canInspectExecution = Boolean(onInspectExecution && message.threadId && message.groupId);

    // 检查是否包含 <think> 标签
    const extracted = extractThinking(content);

    if (extracted) {
      return (
        <>
          <ThinkingMessage content={extracted.thinking} streaming={streaming} agentName={resolvedAgentName} />
          <div className={`message message-assistant ${streaming ? 'streaming' : ''}`}>
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              {(message.agentName || canInspectExecution) ? (
                <div className="message-agent-header">
                  {message.agentName ? <div className="message-agent-name">{resolvedAgentName}</div> : <span />}
                  {canInspectExecution ? (
                    <button
                      type="button"
                      className="message-agent-action"
                      onClick={() => onInspectExecution?.(message)}
                    >
                      <FileSearch size={13} strokeWidth={2} />
                      查看执行详情
                    </button>
                  ) : null}
                </div>
              ) : null}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{extracted.content}</ReactMarkdown>
            </div>
          </div>
        </>
      );
    }

    return (
      <div className={`message message-assistant ${streaming ? 'streaming' : ''}`}>
        <div className="message-avatar">🤖</div>
        <div className="message-content">
          {(message.agentName || canInspectExecution) ? (
            <div className="message-agent-header">
              {message.agentName ? <div className="message-agent-name">{resolvedAgentName}</div> : <span />}
              {canInspectExecution ? (
                <button
                  type="button"
                  className="message-agent-action"
                  onClick={() => onInspectExecution?.(message)}
                >
                  <FileSearch size={13} strokeWidth={2} />
                  查看执行详情
                </button>
              ) : null}
            </div>
          ) : null}
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  if (messageType === 'system') {
    if (content === 'Task completed') {
      return null;
    }

    return (
      <div className="message message-system">
        <div className="message-content">{content}</div>
      </div>
    );
  }

  if (messageType === 'error') {
    return (
      <div className="message message-error">
        <div className="message-content">❌ {content}</div>
      </div>
    );
  }

  if (messageType === 'thinking') {
    return <ThinkingMessage content={content} streaming={streaming} agentName={agentName} />;
  }

  if (messageType === 'tool') {
    // 检查是否是文件操作工具，如果是则不显示（等待 file 消息）
    const isFileOperation = content.match(/^(read_file|write_file|edit_file):/);
    if (isFileOperation) {
      return null;
    }

    return (
      <div className="message message-tool">
        {/* 把 metadata 一起透传下去，方便 tool_result 也能识别真实工具名并应用折叠逻辑。 */}
        <ToolCallMessage content={content} metadata={message.metadata} />
      </div>
    );
  }

  if (messageType === 'file') {
    return (
      <div className="message message-file">
        <FileOperationDisplay content={content} metadata={message.metadata} />
      </div>
    );
  }

  if (messageType === 'todos') {
    // 解析 todos 数据
    let todos = [];
    try {
      if (message.metadata && message.metadata.todos) {
        todos = message.metadata.todos;
      } else if (typeof content === 'string') {
        const parsed = JSON.parse(content);
        todos = parsed.todos || parsed;
      }
    } catch (e) {
      console.error('Failed to parse todos:', e);
    }

    return (
      <div className="message message-tool">
        <TodosToolDisplay todos={todos} />
      </div>
    );
  }

  return null;
}
