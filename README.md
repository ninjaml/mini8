# Mini8.CamphorAgents

一个面向真实工作流程的 AI 工作台。用户可以创建工作空间，配置 Agent，围绕项目进行对话、下达任务、接入知识库、提交成果，并通过审核和定时任务持续管理工作。

**License**: MIT | **Python**: 3.13 | **React**: 18+ | **FastAPI**: 0.116+

## 项目简介

Mini8.CamphorAgents 是一个基于 FastAPI 和 React 构建的全栈 AI 工作台。它把 Agent 放进一个可视化的工作空间中，让用户可以围绕同一个项目持续进行协作，而不是每次打开一个孤立的聊天窗口。

项目当前的用户主路径是：

```text
全局看板 / Agent 团队
        ↓
创建或进入工作空间
        ↓
工作室、项目经理、工作空间群聊
        ↓
任务卡片 → Agent 执行 → 成果提交 → 审核与历史
        ↓
知识库、Agent 技能、定时任务和外部 Agent 接入
```

### 核心概念

- **工作空间（Workspace）** — 一个独立的项目容器，保存项目目标、共享工作目录、Agent、任务、知识库和成果。
- **工作室（Office）** — 工作空间的可视化入口，用来查看 Agent 和当前协作状态。
- **工作空间群聊** — 在项目上下文中发送消息，并让工作成员或外部 Agent 参与当前会话。
- **Agent 团队** — 创建、配置、绑定和管理 Agent，也可以配置专家人格、技能和子 Agent。
- **任务卡片（Work Items）** — 绑定工作成员的具体工作单元，支持成果提交、附件、审批和历史记录。
- **知识库（Knowledge）** — 浏览项目资料和文件内容，并将知识库能力导出给 Agent 使用。
- **定时任务（Cron）** — 按计划触发 MOSS 或 Agent，支持立即运行、暂停、恢复和执行历史查看。
- **外部 Agent** — 在统一界面中配置和使用 Hermes、OpenClaw 等外部服务。

## 系统架构

```
Mini8.CamphorAgents
── 后端（FastAPI + SQLite）
│   ├── 工作空间 API — 工作空间、成员、任务、成果和知识库
│   ├── Agent API — Agent 团队、会话、子 Agent、人格和工作目录
│   ├── 运行时 API — 对话、文件上传、技能、会话和定时任务
│   ├── 外部集成 — Obsidian、企业知识库、Hermes、OpenClaw 和资源市场
│   └── DeepAgents 运行时 — Agent 工具调用、子 Agent 和会话持久化
│
├── 前端（React + Vite）
│   ├── 全局看板 — 工作空间、Agent、知识库和外部连接概览
│   ├── Agent 团队 — Agent 配置、人格、技能、子 Agent 和资源包
│   ├── 工作室 — 可视化工作空间入口和协作状态
│   ├── 工作空间群聊 — 项目上下文中的 Agent 协作
│   ├── 任务与成果 — 任务卡片、附件、审批和历史
│   ├── 知识库 — 文件树、文件预览和 Obsidian 连接
│   ├── 定时任务 — 计划配置、立即运行和执行历史
│   ├── 资源包市场 — 搜索技能和提示词资源包
│   └── 外部 Agent — Hermes 和 OpenClaw 管理与聊天
│
── 打包（PyInstaller）
    └── 独立 Windows 可执行文件，内嵌前端
```

## 技术栈

### 后端

- **框架**: FastAPI 0.116+
- **数据库**: SQLite + SQLAlchemy 2.0
- **智能体框架**: LangGraph + LangChain
- **AI 模型**: OpenAI、Anthropic、DeepSeek、Kimi、智谱、MiniMax
- **搜索**: Tavily
- **沙箱**: Daytona、Modal
- **浏览器自动化**: Playwright

### 前端

- **框架**: React 18+
- **构建工具**: Vite 5
- **UI**: Lucide React 图标库

## 功能特性

### 工作空间与可视化工作室

- 创建、编辑和删除独立的项目工作空间
- 设置项目总目标、共享工作目录和工作成员
- 在工作室中查看 Agent 和工作状态
- 通过全局看板查看所有工作空间、Agent、知识库和连接状态

### Agent 团队与会话

- 创建和配置 Agent，包括模型、工作目录和运行会话
- 为 Agent 绑定多个工作空间
- 配置专家人格、技能和子 Agent
- 在全局会话、工作空间项目经理会话和工作成员会话之间切换
- 支持持久化会话、历史加载、消息回滚、排队消息、多模态输入和停止运行
- 支持 Agent 资源包导入与导出

MOSS 在当前代码中作为全局入口存在；工作空间中还提供项目经理和工作成员等不同会话角色。README 使用这些角色描述用户入口，不把它们简单等同为固定的三种实现类型。

### 工作空间群聊

- 在工作空间中查看和发送项目消息
- 选择具体工作成员参与当前会话
- 将工作空间消息历史注入 Agent 运行上下文
- 在同一入口接入 Hermes 和 OpenClaw

### 任务、成果与审核

- 创建、编辑和删除任务卡片
- 为任务绑定或解绑工作成员
- 下载任务对应的处理 Skill
- 手动提交成果，或上传带附件的成果文件
- 查看、预览、下载和删除成果
- 对成果进行审批并查看审核历史
- 在项目成果库中集中查看交付物

### 知识库

- 创建和管理工作空间知识库连接
- 浏览目录、文件列表和文件内容
- 查看路径、目录统计和当前绑定空间
- 通过 Obsidian Local REST API 读取本地知识库
- 从界面打开本地 Obsidian
- 下载知识库 Skill，让 Agent 按绑定配置使用知识库
- 在已配置企业知识库服务时使用文档、集合、搜索和 RAG 能力

### 定时任务与执行历史

- 为 MOSS 或 Agent 会话创建定时任务
- 使用常用计划或自定义 Cron 表达式
- 暂停、恢复、编辑、删除和立即运行任务
- 查看任务状态、执行次数、最近结果和历史运行事件

### AI 资源包与专家人格

- 在资源市场搜索和筛选技能资源包
- 浏览和获取提示词资源包
- 按标签过滤资源
- 浏览系统内置的专家人格及其提示词、技能资源

### 外部 Agent 集成

- 配置并检查 Hermes 连接状态
- 查看 Hermes Agent、技能、工具集、会话和定时任务
- 配置并连接 OpenClaw Gateway
- 在工作空间群聊或独立管理页中使用外部 Agent

Hermes、OpenClaw、Obsidian、企业知识库、语音识别和资源市场都依赖对应的外部服务或配置；未配置时，相关页面仍可进入，但连接和执行能力不可用。

### 打包部署

- 基于 PyInstaller 的独立 Windows 可执行文件
- 内嵌前端 SPA
- 可移植的数据目录，与可执行文件同级
- 自动端口检测和浏览器启动

## 快速开始

### 前置要求

- Python 3.13
- Node.js 24
- npm

> 详细依赖请查看 `backend/requirements.txt` 和 `frontend/package.json`

### Windows 一键启动

项目提供 `start.ps1`、`start.bat` 和 `start.sh`。Windows 用户可以在项目根目录执行：

```powershell
.\start.ps1
```

脚本会创建后端虚拟环境、安装依赖、构建前端、创建数据目录，并从 `2048` 开始寻找可用端口后启动服务。启动后会自动打开浏览器。

### 手动启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 2048
```

开发环境下前端代理和运行时客户端默认访问 `http://127.0.0.1:2048/api`，因此手动启动后端时建议使用 `2048` 端口。

### 手动启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端页面将在 `http://127.0.0.1:5173` 可用。

### 构建独立可执行文件（Windows）

```bash
# 先构建前端
cd frontend && npm run build && cd ..

# 使用 PyInstaller 打包
backend\.venv\Scripts\python.exe -m PyInstaller mini8.spec --clean
```

打包配置见 `mini8.spec`，输出目录由 PyInstaller 配置决定。

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CAMPHOR_DATA_DIR` | 覆盖数据目录位置 | `{项目根目录}/data` |
| `CAMPHOR_FRONTEND_DIST` | 前端静态文件目录 | `{项目根目录}/frontend/dist` |
| `OBSIDIAN_LOCAL_REST_API_KEY` | Obsidian 本地 REST API 密钥 | - |
| `OBSIDIAN_LOCAL_REST_TIMEOUT` | Obsidian API 超时时间（秒） | `8` |
| `R2R_BASE_URL` | R2R 知识图谱引擎 URL | 见 `backend/app/core/config.py` |

### 数据目录结构

```
data/
└── runtime/
    ├── agents/
    │   └── moss/              # MOSS 运行时配置
    ├── sessions/              # 智能体会话数据
    ├── env/                   # 环境配置
    └── CamphorEOS.db          # SQLite 数据库
```

## API 端点

| 路径前缀 | 说明 |
|----------|------|
| `/api/workspaces` | 工作空间 CRUD 操作 |
| `/api/workspaces/{id}/agents` | 工作空间智能体管理 |
| `/api/workspaces/{id}/items` | 事项卡片管理 |
| `/api/workspaces/{id}/knowledge` | 知识库操作 |
| `/api/workspaces/{id}/messages` | 工作空间消息和群聊上下文 |
| `/api/agents` | Agent、子 Agent、人格和团队管理 |
| `/api/agent-packages` | Agent 资源包导入和导出 |
| `/api/agent-sessions` | Agent 会话配置 |
| `/api/runtime/context` | Agent 运行时上下文和文件上传 |
| `/api/external/hermes` | Hermes 状态、聊天、技能、工具、任务和会话 |
| `/api/hermes-configs` | Hermes 连接配置 |
| `/api/openclaw-configs` | OpenClaw 连接配置 |
| `/api/auth` | 认证 |
| `/api/resource-keys` | 资源密钥管理 |
| `/api/kb-configs` | 知识库服务配置 |
| `/api/enterprise` | 企业知识库 |
| `/api/market` | AI 技能市场代理 |
| `/api/config/export` | MOSS 和知识库 Skill 导出 |
| `/api/runtime/sessions` | DeepAgents 会话管理 |
| `/api/runtime/chat` | DeepAgents WebSocket 对话端点 |
| `/api/runtime/cron` | DeepAgents 定时任务 |
| `/api/speech` | 语音识别 Token 和识别接口 |
| `/health` | 健康检查 |

## 数据库表结构

核心数据表：

- `workspace` — 工作空间定义
- `workspace_agent` — 智能体配置
- `work_item` — 事项卡片
- `work_history` — 成果提交
- `work_knowledge` — 知识库条目
- `resource_key` — 资源访问密钥
- `agent_work` — 智能体-工作关联
- `kb_config` — 知识库配置

## 智能体技能模板

Mini8.CamphorAgents 内置了多种技能模板，定义了智能体的能力：

- **MOSS 技能**: 全局操作、工作空间操作、智能体操作、事项操作、知识操作、进化指南
- **SuperAgent 技能**: 工作空间内的智能体、事项、知识操作
- **WorkAgent 技能**: 事项执行、我的工作事项
- **Obsidian 工具**: 控制、查询、写入、编辑和整理 Obsidian 知识库
- **技能市场**: 市场 API、技能提交指南
- **企业知识库**: 企业知识库操作

## 开发指南

### 项目结构

```
camphorOS/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI 路由处理器
│   │   ├── core/             # 配置和数据库
│   │   ├── models/           # SQLAlchemy 模型
│   │   ├── repositories/     # 数据库访问层
│   │   ├── schemas/          # Pydantic 请求/响应模型
│   │   ├── services/         # 业务逻辑
│   │   ├── prompt_templates/ # 智能体提示词模板
│   │   └── skill_templates/  # 智能体技能模板
│   ├── vendor/
│   │   ├── deepagents/       # 核心智能体框架
│   │   └── deepagents_webapi/# 智能体会话 Web API
│   ├── launcher.py           # 生产环境启动器
│   └── requirements.txt      # Python 依赖
├── frontend/
│   ├── src/
│   │   ├── components/       # 可复用的 UI 组件
│   │   ├── features/         # 功能页面
│   │   └── lib/              # API 客户端和工具函数
│   ├── package.json
│   └── vite.config.js
└── mini8.spec                # PyInstaller 打包配置文件
```

## 社区资源

- [AI 能力市场](https://www.camphorjoy.com/market/index.html) — 发现和获取可复用的技能包
- [乔伊来了社区](https://www.camphorjoy.com/) — 面向工作场景的 AI 学习社区

## 开源协议

MIT
