---
name: obsidian-write
description: 将工作中的信息写入 Obsidian，并按需要建立文档关系。
---

# Obsidian 写入

## 目标

本 skill 只做两件事：

1. 创建知识文档。
2. 建立文档关系。

## 1. 确认目标 vault

写入前先读取统一配置 `../obsidian-control/references/vaults.json`。

- 用户指定 vault：使用指定 vault。
- 用户未指定 vault：使用 `defaultVault`。
- 找不到配置、目标不明确、`rest_base_url` 或 `api_key` 缺失：先澄清，不继续。
- `../obsidian-control/references/vaults.json` 不存在：根据 `../obsidian-control/references/vaults.example.json` 创建模板，让用户补配置。

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
| 查 tag | `GET {vault.rest_base_url}/tags/` |
| 读文档 | `GET {vault.rest_base_url}/vault/{filename}` |
| 创建文档 | `PUT {vault.rest_base_url}/vault/{filename}` |
| 写入关系区域 | `PATCH {vault.rest_base_url}/vault/{filename}` |
| 高级查询 | `POST {vault.rest_base_url}/search/` |
| 简单搜索 | `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}` |
| Omnisearch | `GET {vault.omnisearch_url}/search?q={query}` |

详细 API 说明以 `../obsidian-control/references/api.md` 为准。

## 3. 创建知识文档

输入：用户要记录的内容。

步骤：

1. 确定标题。
2. 读取已有 tag：`GET {vault.rest_base_url}/tags/`。
3. 确定 tags。
4. 生成 Markdown。
5. 确定写入路径。
6. 如果目标文档已存在，先确认是否覆盖。
7. 写入文档。
8. 回读文档，确认内容和 tags 写入成功。

tag 选择规则：

- 用户指定 tag 时优先使用。
- 用户未指定时，从已有 tag 中选择。
- 没有合适已有 tag 时，提出新 tag。
- 新 tag 必须说明原因。
- 不创建同义重复 tag。
- 不创建过宽、无检索价值的 tag。
- tag 不确定时先确认。
- 写入前展示最终 tags；如果有新增或拒绝的近义 tag，说明原因。

最小 frontmatter：

```yaml
---
title: 示例标题
tags:
  - 示例tag
created: 2026-04-24
updated: 2026-04-24
---
```

## 4. 建立文档关系

原则：文档创建后必须检查关系，但不强行写入关系。

步骤：

1. 确定当前文档的 tags。
2. 查询相同 tag 的候选文档。
   如果没有候选文档，报告“暂无同 tag 关系候选”，不默认扩大搜索。
3. 逐个读取候选文档内容。
4. 对比当前文档和候选文档。
5. 只有内容对比能说明关系时，才给出关系建议。
6. 用户确认后写入链接。

用户要求扩大范围时，才使用全文搜索或 Omnisearch 补充候选。

关系建议必须说明：

- 候选文档路径。
- 共享 tag。
- 内容关联点。
- 链接方向：`A -> B`、`B -> A` 或双向。
- A 文档插入位置。
- B 文档插入位置。
- 是否修改已有文档。

方向判断：

- A 引用、依赖、说明或扩展 B：建议 `A -> B`。
- B 是索引页、主题页或上位文档：建议 `B -> A`。
- 两者互相补充且用户需要显式图谱：建议双向。
- 关系弱或位置不清楚：只建议，不写入。

写入规则：

- 修改已有文档前必须先读取。
- 不重复插入同一 wikilink。
- 优先插入已有关系区域，如 `## 相关笔记`。
- 没有合适位置时，先确认是否新增关系区域。

## 5. 输出

写入后报告：

- 操作的 vault。
- 创建或修改的文档路径。
- 使用或新增的 tag。
- 建立的关系。
- 修改过的已有文档。
- 失败、跳过或待确认事项。
