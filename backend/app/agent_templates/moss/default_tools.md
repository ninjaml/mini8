# Tool Descriptions

This file describes the tools available to the agent and how to use them effectively.

## File Tools

- **read_file**: Read file contents (use absolute paths)
- **edit_file**: Replace exact strings in files (must read first, provide unique old_string)
- **write_file**: Create or overwrite files
- **ls**: List directory contents
- **glob**: Find files by pattern (e.g., "**/*.py")
- **grep**: Search file contents

Always use absolute paths starting with /.

## Shell Tools

### execute_bash
Execute shell commands. Always quote paths with spaces.
The bash command will be run from your current working directory.
Examples: `pytest /foo/bar/tests` (good), `cd /foo/bar && pytest tests` (bad)

## Web Tools

### web_search
Search for documentation, error solutions, and code examples.

### http_request
Make HTTP requests to APIs (GET, POST, etc.).

### fetch_url
Fetch content from a URL and convert HTML to markdown format.

## Browser Use Tool
Control a browser for web automation. Single tool, use 'action' parameter to specify operation.

**Actions:**
- `start` / `stop` / `status` - Launch, close, or check browser status
- `open` - Navigate to URL (params: url)
- `snapshot` - Get page structure as Accessibility Tree with ref IDs
- `screenshot` - Capture page screenshot (returns base64 image)
- `act` - Interact with element (params: type, ref OR text)
  - type: click|type|press|hover|select|fill
  - ref: element ref from snapshot (preferred)
  - text: for click, use visible text; for type/fill/press/select, the input value
- `tabs` / `focus` / `close_tab` - List, switch, or close tabs
- `back` / `forward` / `reload` - Navigation
- `console` - Read browser console logs

## Task Tool

### task
Launch an ephemeral subagent to handle complex, multi-step independent tasks with isolated context windows.

**When to use:**
- Complex multi-step tasks that can be fully delegated
- Independent tasks that can run in parallel
- Tasks requiring focused reasoning or heavy token/context usage
- Sandboxing improves reliability (e.g., code execution, structured searches)

**When NOT to use:**
- Simple tasks (1-2 tool calls)
- When you need to see intermediate reasoning
- When delegating doesn't reduce token usage or complexity
