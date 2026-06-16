import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CornerUpLeft } from 'lucide-react';
import ToolCallMessage from '../../components/message/ToolCallMessage';
import FileOperationDisplay from '../../components/message/FileOperationDisplay';
import TodosToolDisplay from '../../components/message/TodosToolDisplay';
import { Tooltip } from '../../components/common/Tooltip';
import './Message.css';

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

function ThinkingMessage({ content, streaming, agentName = "MOSS" }) {
  const [expanded, setExpanded] = useState(false);

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
      </div>
    </div>
  );
}

export function ChatMessage({ message, streaming, onImageClick, onRollback, canRollback, agentName = "MOSS" }) {
  // 兼容两种消息格式：type 或 role
  const messageType = message.type || message.role;
  const content = message.content;

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
            <div className="message-content">{content}</div>
          </div>
        </div>
      </div>
    );
  }

  if (messageType === 'assistant') {
    // 检查是否包含 <think> 标签
    const extracted = extractThinking(content);

    if (extracted) {
      return (
        <>
          <ThinkingMessage content={extracted.thinking} streaming={streaming} agentName={agentName} />
          <div className={`message message-assistant ${streaming ? 'streaming' : ''}`}>
            <div className="message-avatar">🤖</div>
            <div className="message-content">
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
        <ToolCallMessage content={content} />
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
