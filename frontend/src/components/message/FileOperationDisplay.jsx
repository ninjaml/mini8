import { useState } from 'react';
import './FileOperationDisplay.css';

function FileOperationDisplay({ content, metadata }) {
  const [expanded, setExpanded] = useState(false);

  const { tool_name, metrics, diff } = metadata || {};

  // 解析 diff
  const parseDiff = (diffText) => {
    if (!diffText) return [];
    const lines = diffText.split('\n');
    const parsed = [];

    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        // 解析行号: @@ -1,3 +1,4 @@
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
        if (match) {
          oldLineNum = parseInt(match[1]);
          newLineNum = parseInt(match[2]);
        }
        parsed.push({
          type: 'header',
          content: line
        });
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        // 跳过文件名行
        continue;
      } else if (line.startsWith('-')) {
        parsed.push({
          type: 'delete',
          lineNum: oldLineNum,
          content: line.substring(1)
        });
        oldLineNum++;
      } else if (line.startsWith('+')) {
        parsed.push({
          type: 'add',
          lineNum: newLineNum,
          content: line.substring(1)
        });
        newLineNum++;
      } else if (line.startsWith(' ')) {
        parsed.push({
          type: 'context',
          lineNum: oldLineNum,
          content: line.substring(1)
        });
        oldLineNum++;
        newLineNum++;
      } else if (line.trim() === '...') {
        parsed.push({
          type: 'ellipsis',
          content: '...'
        });
      }
    }

    return parsed;
  };

  const diffLines = parseDiff(diff);
  const hasDiff = diffLines.length > 0;

  // 图标
  const getIcon = () => {
    if (tool_name === 'read_file') return '📖';
    if (tool_name === 'write_file') return '📝';
    if (tool_name === 'edit_file') return '✏️';
    return '📁';
  };

  const renderStats = () => {
    if (!metrics) return null;

    if (tool_name === 'read_file') {
      const lines = metrics.lines_read || 0;
      const startLine = metrics.start_line;
      const endLine = metrics.end_line;

      let lineSpan = '';
      if (startLine !== null && startLine !== undefined && endLine !== null && endLine !== undefined) {
        if (startLine === endLine) {
          lineSpan = ` (line ${startLine})`;
        } else {
          lineSpan = ` (lines ${startLine}-${endLine})`;
        }
      } else if (startLine !== null && startLine !== undefined) {
        lineSpan = ` (starting at line ${startLine})`;
      } else if (endLine !== null && endLine !== undefined) {
        lineSpan = ` (through line ${endLine})`;
      }

      return `读取: ${lines} 行${lineSpan}`;
    }

    if (tool_name === 'write_file') {
      return `写入: ${metrics.lines_written || 0} 行`;
    }

    if (tool_name === 'edit_file') {
      return (
        <>
          新增: <span className="stat-added">{metrics.lines_added || 0}</span> 行 |
          删除: <span className="stat-removed">{metrics.lines_removed || 0}</span> 行
        </>
      );
    }

    return null;
  };

  return (
    <div className="file-operation-panel file-op-cat-file">
      <div className="file-operation-header">
        {getIcon()} {content}
      </div>

      {metrics && (
        <div className="file-operation-stats">
          {renderStats()}
        </div>
      )}

      {hasDiff && (
        <>
          <button
            className="diff-toggle-btn"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '▼ 隐藏变更' : `▶ 显示变更 (${diffLines.length} 行)`}
          </button>

          {expanded && (
            <div className="diff-content">
              {diffLines.map((line, i) => {
                if (line.type === 'header') {
                  return (
                    <div key={i} className="diff-line diff-header">
                      {line.content}
                    </div>
                  );
                }
                if (line.type === 'ellipsis') {
                  return (
                    <div key={i} className="diff-line diff-ellipsis">
                      ...
                    </div>
                  );
                }
                return (
                  <div key={i} className={`diff-line diff-${line.type}`}>
                    <span className="diff-line-num">{line.lineNum || ''}</span>
                    <span className="diff-marker">
                      {line.type === 'delete' ? '-' : line.type === 'add' ? '+' : ' '}
                    </span>
                    <span className="diff-code">{line.content}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FileOperationDisplay;
