---
name: obsidian-organize
description: 路由到具体盘点流程，发现 Obsidian 知识库中的核心结构问题。
---

# Obsidian 整理

## 目标

本 skill 只负责找问题，不默认修正问题。

它负责：

1. 确认目标 vault。
2. 判断用户要盘点哪类问题。
3. 路由到对应 reference workflow。
4. 输出问题清单、判断依据和建议。

修正问题需要用户后续明确指令。

## 1. 确认目标 vault

盘点前先读取统一配置 `../obsidian-control/references/vaults.json`。

- 用户指定 vault：使用指定 vault。
- 用户未指定 vault：使用 `defaultVault`。
- 找不到配置、目标不明确、`rest_base_url` 或 `api_key` 缺失：先澄清，不继续。
- `../obsidian-control/references/vaults.json` 不存在：根据 `../obsidian-control/references/vaults.example.json` 创建模板，让用户补配置。
- 默认只盘点一个 vault；跨 vault 盘点必须由用户明确要求。

配置文件：

| 文件 | 作用 |
|---|---|
| `../obsidian-control/references/api.md` | 统一 API 地址、参数、返回值 |
| `../obsidian-control/references/vaults.example.json` | 统一 vault 配置模板 |
| `../obsidian-control/references/vaults.json` | 本地真实 vault 配置 |

## 2. 判断盘点意图

根据用户指令选择 workflow。

| 用户意图 | workflow |
|---|---|
| tag 混乱、tag 不准、近义 tag、错误 tag | `references/workflows/tag-health.md` |
| 悬空链接、错误链接、链接目标不对 | `references/workflows/link-health.md` |
| 标题近似、内容重复、主题重复、指定文档查相似文档 | `references/workflows/duplicate-knowledge.md` |

如果用户只说“整理一下知识库”但没有说明问题类型，先询问要盘点哪一类：

- tag 健康
- 链接健康
- 重复知识

不要在意图不清楚时直接全库扫描。

## 3. 可用 API

认证：

```http
Authorization: Bearer {vault.api_key}
```

| 能力 | API |
|---|---|
| 列目录 | `GET {vault.rest_base_url}/vault/` |
| 读文档 | `GET {vault.rest_base_url}/vault/{filename}` |
| 读结构化文档 | `GET {vault.rest_base_url}/vault/{filename}` + `Accept: application/vnd.olrapi.note+json` |
| 查 tag | `GET {vault.rest_base_url}/tags/` |
| 高级查询 | `POST {vault.rest_base_url}/search/` |
| 简单搜索 | `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}` |
| Omnisearch | `GET {vault.omnisearch_url}/search?q={query}` |

详细 API 说明以 `../obsidian-control/references/api.md` 为准。

## 4. 通用规则

- 只做盘点和诊断，不主动修改 vault。
- 每个问题必须给出判断依据。
- 无法确定的问题标记为人工复核。
- 修复建议只能作为建议输出。
- 需要修改时，等待用户给出明确修复指令。

## 5. 输出

盘点后报告：

- 操作的 vault。
- 使用的 workflow。
- 盘点范围。
- 发现的问题。
- 判断依据。
- 建议处理方式。
- 需要人工复核的事项。
