# deepagents — 核心库

## 概述

`deepagents` 是整个项目的基础库，提供 AI Agent 的创建、中间件管道、后端存储抽象和子代理机制。CLI（`deepagents_cli`）和 Web API（`deepagents_webapi`）都依赖此包来构建 Agent。

核心入口是 `create_deep_agent()` 函数，它将模型、工具、中间件、后端组装成一个可运行的 LangGraph Agent。

## 架构

```
create_deep_agent()
    │
    ├── 模型（ChatOpenAI / ChatAnthropic / ChatDeepSeek / ChatKimi）
    │
    ├── 中间件管道（按顺序执行）
    │   ├── DeepSeekSummarizationMiddleware  — 对话过长时自动总结
    │   ├── TodoListMiddleware               — 任务清单管理
    │   ├── FilesystemMiddleware             — 文件操作工具（ls/read/write/edit/grep/glob）
    │   ├── SubAgentMiddleware               — 子代理（task 工具）
    │   ├── ShellMiddleware                  — Shell 命令执行
    │   ├── AnthropicPromptCachingMiddleware — Anthropic 模型缓存优化
    │   ├── PatchToolCallsMiddleware         — 修复悬空的 tool call
    │   └── HumanInTheLoopMiddleware         — 人工审批（可选）
    │
    └── 后端（BackendProtocol）
        ├── FilesystemBackend  — 本地文件系统
        ├── CompositeBackend   — 路由分发（按路径前缀分发到不同后端）
        ├── StateBackend       — LangGraph 状态存储
        └── SandboxBackend     — 远程沙箱（Modal/Runloop/Daytona）
```

## 文件结构

```
deepagents/
├── __init__.py              # 导出 create_deep_agent 和核心中间件
├── graph.py                 # 核心：create_deep_agent() 函数
├── backends/
│   ├── protocol.py          # 后端接口定义（BackendProtocol, SandboxBackendProtocol）
│   ├── filesystem.py        # 本地文件系统后端（Windows）
│   ├── composite.py         # 组合后端：按路径前缀路由到不同后端
│   ├── sandbox.py           # 沙箱后端基类
│   ├── state.py             # LangGraph 状态存储后端
│   ├── store.py             # 持久化 KV 存储后端
│   └── utils.py             # 后端工具函数
└── middleware/
    ├── deepseek_summarization.py  # 对话总结中间件（token 超限时自动总结历史）
    ├── filesystem.py              # 文件操作中间件（Windows 版）
    ├── filesystem_linux.py        # 文件操作中间件（Linux/Mac 版）
    ├── filesystem_factory.py      # 工厂：根据平台创建对应的文件中间件
    ├── shell.py                   # Shell 命令中间件（Windows 版）
    ├── shell_linux.py             # Shell 命令中间件（Linux/Mac 版）
    ├── shell_factory.py           # 工厂：根据平台创建对应的 Shell 中间件
    ├── subagents.py               # 子代理中间件：提供 task 工具，支持并行子任务
    └── patch_tool_calls.py        # 修复悬空 tool call（中断恢复时补充 ToolMessage）
```

## 核心模块详解

### graph.py — Agent 创建

`create_deep_agent()` 是整个库的入口，接收模型、工具、中间件、后端等参数，组装成一个完整的 LangGraph Agent。

关键逻辑：
- 根据模型类型（Kimi/其他）设置不同的总结触发阈值（Kimi 200K tokens，其他 800K）
- 自动添加默认中间件栈（总结、文件、Shell、子代理等）
- 支持 Human-in-the-Loop 中断审批
- 返回 `CompiledStateGraph`，可直接 `.invoke()` 或 `.astream()` 调用

### backends/protocol.py — 后端接口

定义了两个核心协议：

- `BackendProtocol`：基础文件操作接口（ls、read、write、edit、grep、glob、upload、download）
- `SandboxBackendProtocol`：继承 BackendProtocol，额外支持 `execute()` 命令执行

所有后端实现（本地文件系统、远程沙箱、状态存储）都遵循这两个协议，保证上层代码不关心底层存储细节。

### backends/composite.py — 组合后端

`CompositeBackend` 根据文件路径前缀将操作路由到不同的后端。例如：
- `/memories/notes.txt` → 内存后端
- `/workspace/main.py` → 文件系统后端

支持批量操作（upload_files/download_files）的自动分组，按后端批量调用以提高效率。

### middleware/deepseek_summarization.py — 对话总结

当对话 token 数超过阈值时，自动生成中文摘要替换旧历史，只保留最新的几条消息。

特殊处理：
- Kimi 模型使用轻量模型 `moonshot-v1-auto` 做总结（避免 k2.5 的 reasoning 开销）
- 其他模型直接复用主模型做总结
- 总结前会通过 WebSocket 通知前端"正在总结对话"

### middleware/subagents.py — 子代理

提供 `task` 工具，允许主 Agent 启动短生命周期的子代理来处理独立任务。

核心设计：
- 子代理有独立的上下文窗口，不会污染主对话
- 支持并行启动多个子代理
- 默认包含一个通用子代理（general-purpose），拥有与主 Agent 相同的工具
- 支持自定义子代理（指定名称、描述、工具、模型）

### middleware/patch_tool_calls.py — 修复悬空 tool call

当对话被中断（用户发新消息、网络断开等）时，可能留下没有对应 `ToolMessage` 的 `AIMessage.tool_calls`。这个中间件在每次 Agent 运行前扫描历史，为悬空的 tool call 补充一条"已取消"的 ToolMessage，避免模型报错。

## 依赖

```
langchain
langchain-openai
langchain-anthropic
langgraph
tiktoken
```

## 使用方式

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model=my_model,
    system_prompt="你是一个编程助手",
    tools=[my_tool],
    backend=my_backend,
    checkpointer=my_checkpointer,
)

# 同步调用
result = agent.invoke({"messages": [{"role": "user", "content": "你好"}]})

# 异步流式调用
async for chunk in agent.astream({"messages": [...]}, stream_mode=["messages"]):
    print(chunk)
```
