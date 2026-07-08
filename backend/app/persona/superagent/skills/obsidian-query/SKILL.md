---
name: obsidian-query
description: 从 Obsidian 中读取、搜索、查询、导出信息，并查询文档关系。
---

# Obsidian 查询

## 目标

本 skill 只做读取和查询，不修改 vault。

主要能力：

1. 读取文档。
2. 搜索内容。
3. 按 tag 或 frontmatter 查询。
4. 查询文档关系和知识图谱。
5. 导出查询结果。

## 1. 确认目标 vault

查询前先读取统一配置 `../obsidian-control/references/vaults.json`。

- 用户指定 vault：使用指定 vault。
- 用户未指定 vault：使用 `defaultVault`。
- 找不到配置、目标不明确、`rest_base_url` 或 `api_key` 缺失：先澄清，不继续。
- `../obsidian-control/references/vaults.json` 不存在：根据 `../obsidian-control/references/vaults.example.json` 创建模板，让用户补配置。
- `omnisearch_url` 为空：跳过 Omnisearch，只使用 Local REST API。

配置文件：

| 文件 | 作用 |
|---|---|
| `../obsidian-control/references/api.md` | 统一 API 地址、参数、返回值 |
| `../obsidian-control/references/vaults.example.json` | 统一 vault 配置模板 |
| `../obsidian-control/references/vaults.json` | 本地真实 vault 配置 |

## 2. 可用 API

认证：

```http
Authorization: Bearer {vault.api_key}
```

| 能力 | API |
|---|---|
| 服务状态 | `GET {vault.rest_base_url}/` |
| 列根目录 | `GET {vault.rest_base_url}/vault/` |
| 列目录 | `GET {vault.rest_base_url}/vault/{pathToDirectory}/` |
| 读文档 | `GET {vault.rest_base_url}/vault/{filename}` |
| 读结构化文档 | `GET {vault.rest_base_url}/vault/{filename}` + `Accept: application/vnd.olrapi.note+json` |
| 查 tag | `GET {vault.rest_base_url}/tags/` |
| 简单搜索 | `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}` |
| 高级查询 | `POST {vault.rest_base_url}/search/` |
| Omnisearch | `GET {vault.omnisearch_url}/search?q={query}` |

详细 API 说明以 `../obsidian-control/references/api.md` 为准。

## 3. 查询方式

根据用户意图选择查询方式。默认不要让用户按目录浏览文件；优先帮用户取回答案、证据、主题或关系。

### 3.1 问答式查询

用户问“我之前怎么想的”“有没有记录过某事”“某个问题的结论是什么”。

应对：

1. 优先用 Omnisearch 召回候选文档。
2. 如果 Omnisearch 不可用，降级使用 `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}`，只做简单全文搜索，不保证相关性排序或相似召回质量。
3. 根据返回的 `path` 读取候选文档全文。
4. 汇总答案。
5. 给出来源文档和关键片段。

### 3.2 找资料

用户想找某个主题、关键词、概念或资料。

应对：

1. 优先用 Omnisearch 搜索。
2. 返回最相关文档、命中原因和片段。
3. 只有用户要求定位、打开、导出或建立关系时，才展示完整路径等详细信息。

### 3.3 条件查询

用户明确要求按 tag、frontmatter、路径或结构化条件查询。

应对：

1. tag 查询先读 `GET {vault.rest_base_url}/tags/` 确认 tag 是否存在。
2. frontmatter、tag、路径组合查询使用 `POST {vault.rest_base_url}/search/`。
3. 返回匹配文档和匹配条件。

### 3.4 指定文档读取

用户明确给出文档路径、标题或要求查看某篇文档。

应对：

1. 能确定路径时，直接 `GET {vault.rest_base_url}/vault/{filename}`。
2. 不能确定路径时，先用 Omnisearch 搜标题或关键词。
3. 多个候选时，让用户选择。

### 3.5 图谱查询

用户询问某篇文档和哪些文档有关、某个主题的上下游关系、入链、出链或邻居节点。

说明：Local REST API 没有原生知识图谱接口，图谱关系需要从文档内容中推导。Obsidian 链接有方向：如果 A 文档中链接 `[[B]]`，则边为 `A -> B`，B 属于 A 的子图谱。

查询前先确认：

- 起点：文档、tag、主题关键词或搜索结果集。
- 方向：向下查询子图谱、向上追踪入链、双向邻域。
- 层级：默认 1 层，最大 10 层。

应对：

1. 确定查询范围。
2. 确定起点节点集合。
3. 读取起点文档，提取正文中的 `[[wikilink]]` 和 `![[embed]]`。
4. 构建边：当前文档 `->` 被链接文档。
5. 按用户指定方向逐层递归扩展。
6. 返回节点、边、方向、层级和来源。

起点转换规则：

- 文档起点：直接作为起点节点。
- tag 起点：用结构化查询取该 tag 下的文档集合。
- 主题关键词起点：用 Omnisearch 召回候选，并让用户确认起点集合。
- 搜索结果集起点：直接使用结果集中的文档作为起点集合。

方向定义：

- 向下查询子图谱：沿出链扩展，即 `A -> B -> C`。
- 向上追踪入链：沿入链反向扩展，即谁链接到了当前文档。
- 双向邻域：同时包含入链和出链。

层级规则：

- 默认 1 层。
- 用户可以指定 1 到 10 层。
- 超过 10 层时，按 10 层执行。
- 第 1 层从起点的直接链接开始。
- 每一层只扩展上一层新发现的节点。
- 必须维护 `visited` 集合，已访问节点不再扩展。
- Obsidian 图谱可能存在循环，不要假设它是 DAG。
- 如果某层没有新节点，提前结束递归。

递归代码示例见 `references/graph-recursion-example.md`。

图谱查询结果必须说明：

- 节点路径。
- 出链。
- 入链。
- 边的方向。
- 查询层级。
- 关系来源：正文 wikilink 或嵌入链接。

frontmatter 和 tags 只能作为分类信息，不等同于文档关系边。

### 3.6 导出查询结果

用户要求导出某个主题、搜索结果、tag 集合或图谱邻域。

应对：

1. 先确定查询条件。
2. 得到结果集。
3. 按用户要求导出。

查询规则：

- 自然语言知识查询优先 Omnisearch。
- Local REST API 用于读取全文、结构化过滤、图谱解析和导出。
- 路径、文件大小、mtime 等详细属性默认不展示，除非用户需要定位、打开、导出或区分候选。
- 查询只读，不修改 vault。

## 4. 导出

导出是查询能力，只读取和转换结果，不修改 vault。

可导出范围：

- 单篇文档。
- 目录。
- tag 查询结果。
- frontmatter 查询结果。
- 搜索结果。
- 某个文档的图谱邻域。

## 5. 输出

查询后报告：

- 操作的 vault。
- 查询方式。
- 回答或结论。
- 依据片段。
- 来源文档标题。
- 仅在需要定位、导出、区分同名文档或用户要求时展示路径。
- 如果是图谱查询，报告节点和边。
- 如果是导出，报告范围、数量、格式和输出位置。
