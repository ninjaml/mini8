---
name: obsidian-control
description: 作为 Obsidian 技能总路由，统一确认 vault、引用统一 API，并分发到写入、查询、整理或编辑技能。
---

# Obsidian Control

## 目标

本 skill 是 Obsidian 系列技能的总入口。

它负责：

1. 确认用户要操作的目标 vault。
2. 使用统一的 vault 连接配置。
3. 使用统一的 API 参考。
4. 判断用户意图并路由到对应子 skill。

它不直接执行复杂业务流程；具体工作交给子 skill。

## 1. 统一配置

所有 Obsidian 子 skill 都使用同一份配置：

| 文件 | 作用 |
|---|---|
| `obsidian-control/references/vaults.json` | 本地真实 vault 连接配置 |
| `obsidian-control/references/vaults.example.json` | vault 配置模板 |
| `obsidian-control/references/api.md` | Local REST API 和 Omnisearch 统一 API 说明 |

执行任何子 skill 前，先读取 `obsidian-control/references/vaults.json`。

路径视角说明：

- 在 `obsidian-control` 内部，配置路径写作 `obsidian-control/references/...`。
- 在兄弟子 skill 中，配置路径写作 `../obsidian-control/references/...`。
- 两种写法指向同一份文件；不要在子 skill 内另建独立配置。

- 用户指定 vault：使用指定 vault。
- 用户未指定 vault：使用 `defaultVault`。
- 找不到配置、目标不明确、`rest_base_url` 或 `api_key` 缺失：先澄清，不继续。
- `obsidian-control/references/vaults.json` 不存在：根据 `obsidian-control/references/vaults.example.json` 创建模板，让用户补配置。
- Local REST API 和 Omnisearch 都按 vault 单独配置，不能假设一个地址可以操作所有仓库。
- Local REST API 和 Omnisearch 都是 Obsidian 本机插件服务，`rest_base_url` 和 `omnisearch_url` 必须使用 `localhost`，不要使用 `127.0.0.1`、`[::1]`、局域网 IP、公网 IP 或域名。

## 2. 路由规则

根据用户意图选择子 skill。

| 用户意图 | 子 skill |
|---|---|
| 新建知识文档、记录工作知识、写入并建立关系 | `obsidian-write` |
| 查询资料、搜索知识库、读取文档、图谱查询、导出查询结果 | `obsidian-query` |
| 盘点 tag、检查链接、发现重复知识、输出整理建议 | `obsidian-organize` |
| 用户明确要求修改已有文档、追加、替换、改 frontmatter、覆盖整篇 | `obsidian-edit` |

如果用户意图不清楚，先澄清，不直接调用子 skill。

## 3. 组合规则

常见组合：

- 先查询再写入：先用 `obsidian-query` 找资料，再由用户确认是否用 `obsidian-write` 记录。
- 先整理再修复：先用 `obsidian-organize` 发现问题，用户明确要求修复后再用 `obsidian-edit`。
- 新建文档并建立关系：使用 `obsidian-write`，不要转到 `obsidian-edit`。
- 修改已有文档：使用 `obsidian-edit`，不要转到 `obsidian-write`。

## 4. API 规则

API 细节只维护在：

```text
obsidian-control/references/api.md
```

子 skill 可以保留必要的 API 速查，但不得维护自己的完整 API 文档。

如果子 skill 中的 API 写法与 `obsidian-control/references/api.md` 冲突，以 `obsidian-control/references/api.md` 为准。

## 5. 输出

路由后需要说明：

- 目标 vault。
- 使用的子 skill。
- 使用的配置来源。
- 如果需要 API，引用 `obsidian-control/references/api.md`。
