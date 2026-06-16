import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { Tooltip } from "../../components/common/Tooltip";

function QueuedMessagesList({ queuedMessages, onRemoveQueued }) {
  if (!queuedMessages || queuedMessages.length === 0) return null;

  return (
    <div className="queued-messages-list">
      <div className="queued-messages-header">
        <span className="queue-icon">⏳</span>
        <span className="queue-title">队列中的消息 ({queuedMessages.length})</span>
      </div>
      {queuedMessages.map((msg, index) => (
        <div key={msg.id} className="queued-message-item">
          <div className="queued-message-content">
            <span className="queued-message-index">#{index + 1}</span>
            <span className="queued-message-text">
              {msg.text.length > 50 ? `${msg.text.substring(0, 50)}...` : msg.text}
            </span>
          </div>
          <Tooltip text="取消发送">
            <button
              className="queued-message-remove"
              onClick={() => onRemoveQueued(msg.id)}
              aria-label="取消发送"
            >
              ×
            </button>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}

function ImagePreviewModal({ imageUrl, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="image-preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className="image-preview-container" onClick={(e) => e.stopPropagation()}>
        <img src={imageUrl} alt="Preview" className="image-preview-full" />
        <button
          className="image-preview-close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Close preview"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function ChatFeed({
  emptyText = "当前还没有对话记录。",
  messages,
  isStreaming,
  hasMoreHistory = false,
  isLoadingMore = false,
  onLoadMore = null,
  onRollback = null,
  canRollback = false,
  queuedMessages = [],
  onRemoveQueued = null,
  agentName = "MOSS",
}) {
  const feedRef = useRef(null);
  const isNearBottomRef = useRef(true); // Track if user is near bottom
  const previousScrollHeightRef = useRef(0);
  const [previewImage, setPreviewImage] = useState(null);

  // Handle scroll to detect position and load more
  useEffect(() => {
    const feedElement = feedRef.current;
    if (!feedElement) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = feedElement;

      // Update whether user is near bottom (within 100px)
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      isNearBottomRef.current = distanceFromBottom < 100;

      // Check if scrolled to top (with 50px threshold) - load more history
      if (scrollTop < 50 && hasMoreHistory && !isLoadingMore && onLoadMore) {
        console.log("[ChatFeed] Reached top, loading more messages...");
        previousScrollHeightRef.current = scrollHeight;
        onLoadMore();
      }
    };

    feedElement.addEventListener("scroll", handleScroll);
    return () => feedElement.removeEventListener("scroll", handleScroll);
  }, [hasMoreHistory, isLoadingMore, onLoadMore]);

  // Maintain scroll position after loading more messages
  useEffect(() => {
    const feedElement = feedRef.current;
    if (!feedElement || !isLoadingMore) return;

    // After new messages are loaded, restore scroll position
    if (previousScrollHeightRef.current > 0) {
      const newScrollHeight = feedElement.scrollHeight;
      const heightDifference = newScrollHeight - previousScrollHeightRef.current;
      feedElement.scrollTop = heightDifference;
      previousScrollHeightRef.current = 0;
    }
  }, [messages.length, isLoadingMore]);

  // Auto-scroll to bottom for new messages (only if user is near bottom)
  useEffect(() => {
    const feedElement = feedRef.current;
    if (!feedElement || isLoadingMore) return;

    // Only auto-scroll if user is near the bottom
    if (isNearBottomRef.current) {
      feedElement.scrollTop = feedElement.scrollHeight;
    }
  }, [messages, isLoadingMore]);

  if (!messages?.length) {
    return <div className="empty-inline">{emptyText}</div>;
  }

  return (
    <div className="chat-feed" ref={feedRef}>
      {isLoadingMore && (
        <div className="chat-loading-more">
          <span>加载更多消息...</span>
        </div>
      )}
      {messages.map((message, index) => {
        // 最后一条消息且正在流式传输时，标记为 streaming
        const streaming = isStreaming && index === messages.length - 1;
        return (
          <ChatMessage
            key={message.id}
            message={message}
            streaming={streaming}
            onImageClick={setPreviewImage}
            onRollback={onRollback}
            canRollback={canRollback && message.role === 'user' && typeof message.messageIndex === 'number'}
            agentName={agentName}
          />
        );
      })}
      <QueuedMessagesList queuedMessages={queuedMessages} onRemoveQueued={onRemoveQueued} />
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
