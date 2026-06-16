# mini8

一个 AI 驱动的工作空间管理系统，将工作组织为工作空间、智能体、事项卡片、知识库和成果历史，实现人类与 AI 智能体的智能协作。

**License**: MIT | **Python**: 3.13 | **React**: 18+ | **FastAPI**: 0.116+

## 项目简介

mini8 是一个基于 FastAPI 和 React 构建的全栈 AI 智能体编排平台。它提供了一种结构化的方式来组织真实工作，让 AI 智能体能够自主地进行规划、执行、审核和交付成果。

### 核心概念

- **工作空间（Workspace）** — 独立的项目容器，包含目标、智能体、事项、知识库和成果
- **MOSS** — 全局控制智能体和 AI 工作教练，帮助用户跨所有工作空间组织工作
- **SuperAgent** — 工作空间级别的管理者（项目经理），管理单个工作空间内的智能体、事项、知识库和成果
- **WorkAgent** — 执行专员，负责执行具体的事项卡片
- **事项卡片（Work Items）** — 带有需求、交付标准和审核流程的任务单元
- **知识库（Knowledge Base）** — 项目资料、经验、方法论的沉淀，作为智能体的工作上下文
- **成果历史（Deliverable History）** — 已完成事项卡片的提交、审核和评审记录

## 系统架构

```
mini8
── 后端（FastAPI + SQLite）
│   ├── 核心 API — 工作空间、智能体、事项、知识库和成果的 CRUD 操作
│   ├── 智能体系统 — MOSS、SuperAgent 和 WorkAgent，配备提示词模板
│   ├── 技能系统 — 可复用的智能体能力模板
│   └── DeepAgents — 基于 LangGraph 的智能体框架，带中间件管道
│
├── 前端（React + Vite）
│   ├── 工作空间总览 — 概览和管理
│   ├── 智能体页面 — 智能体创建、配置和对话
│   ├── 事项页面 — 事项卡片管理和成果审核
│   ├── 知识页面 — 知识库配置和浏览
│   └── 全局视图 — 通过 MOSS 跨工作空间管理
│
── 打包（PyInstaller）
    └── 独立 Windows 可执行文件 mini8.exe，内嵌前端
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

### 工作空间管理

- 创建和管理独立的项目工作空间
- 工作空间总览，聚合统计数据
- 通过 MOSS 智能体实现跨工作空间全局视图

### 智能体系统

- **三层智能体架构**: MOSS（全局）→ SuperAgent（工作空间）→ WorkAgent（执行）
- 提示词模板系统，包含身份、行为和工具定义
- 技能模板系统，用于可复用的智能体能力
- 智能体对话，支持持久化 WebSocket 连接
- 子智能体支持，用于并行任务执行
- 人工审核工作流

### 任务与成果管理

- 创建带有需求和交付标准的事项卡片
- 将事项卡片绑定到指定的 WorkAgent
- 提交带附件的成果
- 审核和审批工作流
- 成果历史和审计追踪

### 知识库

- 工作空间级别的知识库配置
- Obsidian 本地 REST API 集成
- 基于技能的知识操作

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

### 后端启动

```bash
cd backend

# 创建虚拟环境
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
python -m uvicorn app.main:app --reload
```

API 服务将在 `http://127.0.0.1:8000/api` 可用。

### 前端启动

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

可执行文件将输出到 `dist_package/mini8.exe`。

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CAMPHOR_DATA_DIR` | 覆盖数据目录位置 | `{项目根目录}/data` |
| `CAMPHOR_FRONTEND_DIST` | 前端静态文件目录 | `{项目根目录}/frontend/dist` |
| `OBSIDIAN_LOCAL_REST_API_KEY` | Obsidian 本地 REST API 密钥 | - |
| `OBSIDIAN_LOCAL_REST_TIMEOUT` | Obsidian API 超时时间（秒） | `8` |

### 数据目录结构

```
data/
└── runtime/
    ├── agents/
    │   └── moss/              # MOSS 运行时配置
    ├── sessions/              # 智能体会话数据
    ├── env/                   # 环境配置
    └── mini8.db               # SQLite 数据库
```

## API 端点

| 路径前缀 | 说明 |
|----------|------|
| `/api/workspaces` | 工作空间 CRUD 操作 |
| `/api/workspaces/{id}/agents` | 工作空间智能体管理 |
| `/api/workspaces/{id}/items` | 事项卡片管理 |
| `/api/workspaces/{id}/knowledge` | 知识库操作 |
| `/api/workspaces/{id}/dashboard` | 工作空间总览 |
| `/api/auth` | 认证 |
| `/api/resource-keys` | 资源密钥管理 |
| `/sessions` | 智能体会话管理 |
| `/chat` | WebSocket 对话端点 |
| `/agents` | 智能体配置 |
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

## 智能体技能模板

mini8 内置了多种技能模板，定义了智能体的能力：

- **MOSS 技能**: 全局操作、工作空间操作、智能体操作、事项操作、知识操作、进化指南
- **SuperAgent 技能**: 工作空间内的智能体、事项、知识操作
- **WorkAgent 技能**: 事项执行、我的工作事项
- **Obsidian 工具**: 控制、查询、写入、编辑和整理 Obsidian 知识库

## 开发指南

### 项目结构

```
mini8/
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

- [乔伊来了社区](https://www.camphorjoy.com/) — 面向工作场景的 AI 学习社区

## 开源协议

MIT
