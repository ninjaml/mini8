# 06-health-check — 图谱构建、诊断与修复

## 概述

当用户意图涉及**知识图谱的构建、质量检查、清理修复**时，使用本文档。

### 权限矩阵（收到 403 时参考）

| 操作 | 系统管理员 | collection write | collection read |
|------|-----------|-----------------|----------------|
| Pull / Communities Build / Reset | ✅ | ✅ | ❌ |
| 质量检测（悬空/孤立/重复） | ✅ | ✅ | ✅ |
| 修复操作（清理/合并/重定向） | ✅ | ✅ | ❌ |
| 更新实体 / 创建社区 | ✅ | ✅ | ❌ |
| 查看图谱数据 | ✅ | ✅ | ✅ |

> **Agent 不需要预先判断自己的身份。** 直接按用户意图调用 API，后端会自动校验权限。如果返回 403，参考上表向用户说明需要何种权限。

---

## 图谱构建

### Pull：同步文档抽取结果到集合图谱

**权限要求：系统管理员 或 collection write**

文档抽取在文档层面，必须通过 Pull 同步到集合图谱才能全局检索。

```
POST /api/collections/{collection_id}/graph/pull
```

> 如返回 403，说明当前用户没有该知识库的写入权限，无法执行 Pull。

**重要：** Pull 前确认抽取已完成。不要遍历全部文档轮询——抽查 2-3 个文档的 `r2r-status`，大部分 completed 即可视为完成。如果大部分 pending/failed，**不要 Pull**，告知用户稍后再试或强制重抽。

### 构建社区摘要

**权限要求：系统管理员 或 collection write**

```
POST /api/collections/{collection_id}/graph/communities/build
```

**异步任务**，调用后立即返回"已提交到后台队列"。

> 如返回 403，说明当前用户没有该知识库的写入权限。

### 重置图谱

**权限要求：系统管理员 或 collection write**

```
POST /api/collections/{collection_id}/graph/reset
```

清空该集合所有实体、关系、社区数据。需要重新抽取和 Pull。

> 如返回 403，说明当前用户没有该知识库的写入权限。

### 查看图谱数据（验证用）

```
GET /api/collections/{collection_id}/graph/entities?limit=5
GET /api/collections/{collection_id}/graph/relationships?limit=5
GET /api/collections/{collection_id}/graph/communities?limit=5
```

---

## 质量检测

> **⚠️ 扫描限制：** 悬空关系和孤立实体检测只扫描前 500 个实体和前 500 条关系。超过此规模，结果可能不完整。

### 悬空关系

```
GET /api/collections/{collection_id}/graph/dangling-relationships
```

关系的 subject_id 或 object_id 在实体列表中找不到。

### 孤立实体

```
GET /api/collections/{collection_id}/graph/orphan-entities
```

实体 ID 未出现在任何关系的 subject_id 或 object_id 中。

### 重复/近义实体

```
GET /api/collections/{collection_id}/graph/similar-entities?mode=llm
```

| mode | 说明 |
|------|------|
| llm（推荐） | DeepSeek 智能判断，识别同义异名 |
| similar | 字符串相似度 ≥65%，速度快但不智能 |

**返回的 reason：**
- `同名` — 名称完全相同
- `近义` — 同物异名（缩写/全称、中英文）
- `相似` — 高度相似，可能是同一事物

> LLM 调用失败时会自动降级到字符串匹配，此时 reason 变为 `"字符串相似度 65%+ 组 (N个实体)"`。告知用户降级情况。

---

## 修复操作

**核心原则：诊断和处理分开。必须先展示报告，未经用户明确确认不得自动执行任何清理或合并。**

### 批量删除（清理悬空 + 孤立）

**权限要求：系统管理员 或 collection write**

```
POST /api/collections/{collection_id}/graph/batch-delete
```

```json
{
  "entity_ids": ["orphan-uuid-1"],
  "relationship_ids": ["dangling-rel-uuid-1"]
}
```

> 如返回 403，说明当前用户没有该知识库的写入权限，无法执行清理操作。

> **⚠️ 10000 条扫描上限：** 删除实体时扫描全量关系清理关联，最多扫描 10000 条。超大型图谱建议分多次操作，或先手动删关系再删实体。

### 合并重复实体

**权限要求：系统管理员 或 collection write**

```
POST /api/collections/{collection_id}/graph/merge-entities
```

```json
{
  "source_entity_ids": ["uuid-2", "uuid-3"],
  "target_entity_id": "uuid-1"
}
```

- `source_entity_ids`：被合并删除的实体
- `target_entity_id`：保留的目标实体，关系重定向到这里

> 如返回 403，说明当前用户没有该知识库的写入权限，无法执行合并。

> **⚠️ 不可逆！** 被合并的 source 实体会被删除。
> **⚠️ 10000 条扫描上限：** 合并时遍历全量关系做重定向，最多扫描 10000 条。大型图谱建议分多次合并。

### 重定向单条关系

**权限要求：系统管理员 或 collection write**

```
POST /api/collections/{collection_id}/graph/reroute-relationship
```

```json
{
  "relationship_id": "rel-uuid-X",
  "new_subject_id": "correct-subject-uuid",
  "new_object_id": "correct-object-uuid"
}
```

不传则保持原值不变。

> 如返回 403，说明当前用户没有该知识库的写入权限。

---

## 高级操作

### 更新实体

**权限要求：系统管理员 或 collection write**

```
POST /api/collections/{collection_id}/graph/entities/{entity_id}/update
```

```json
{
  "name": "新名称",
  "description": "更新后的描述"
}
```

> 如返回 403，说明当前用户没有该知识库的写入权限。

### 手动创建社区

**权限要求：系统管理员 或 collection write**

```
POST /api/collections/{collection_id}/graph/communities/create
```

```json
{
  "name": "项目管理相关",
  "summary": "...",
  "findings": ["..."]
}
```

---

## 完整巡检流程

```
检测 → 汇总报告 → 用户确认 → 执行修复 → 重新检测验证
```

1. **并行检测**：调用 dangling-relationships、orphan-entities、similar-entities
2. **汇总报告**：展示数量、详情、处理建议
3. **等待确认**：悬空/孤立建议清理；重复需逐组或批量确认合并方案
4. **执行修复**：batch-delete 清理悬空+孤立；merge-entities 处理重复
5. **验证**：重新执行三项检测，确认清零

---

## 完整对话示例

```
用户："帮我看一下'技术文档库'的知识图谱质量怎么样"

Agent：
  → GET /api/collections
  → 匹配 name="技术文档库"，得到 collection_id=3

Agent："正在对'技术文档库'执行三项质量检测，请稍候..."
  → GET /api/collections/3/graph/dangling-relationships
  → GET /api/collections/3/graph/orphan-entities
  → GET /api/collections/3/graph/similar-entities?mode=llm

Agent："检测完成，结果如下：

=== 知识图谱巡检报告（技术文档库）===

【悬空关系】发现 3 条 — 可自动清理
【孤立实体】发现 1 个 — 可自动清理
【重复/近义实体】发现 2 组 — 需要您决定

--- 重复实体详情 ---
组1（同名）："项目管理部" × 3个
  - uuid-1 (DEPARTMENT)
  - uuid-2 (DEPARTMENT)
  - uuid-3 (DEPARTMENT)

组2（近义）："HR" ↔ "人力资源部"
  - uuid-4 (DEPARTMENT, "HR")
  - uuid-5 (DEPARTMENT, "人力资源部")

请问如何处理？
1. 悬空关系和孤立实体：建议清理
2. 重复实体：可以全部合并、逐组确认，或暂不处理"

用户："清理悬空和孤立的，重复的我看看"

Agent："确认清理 3 条悬空关系和 1 个孤立实体吗？"

用户："确认清理"

Agent：
  → POST /api/collections/3/graph/batch-delete
    {"entity_ids":["orphan-uuid"],"relationship_ids":["rel-1","rel-2","rel-3"]}

Agent："已清理完成。现在处理重复实体：

组1：'项目管理部' 3个实体，建议保留 uuid-1，合并 uuid-2、uuid-3
组2：'HR' ↔ '人力资源部'，建议保留 uuid-5，合并 uuid-4

可以全部按上述方案合并，也可以逐组确认。"

用户："全部合并"

Agent："确认按以下方案合并吗？
- 组1：保留 uuid-1，合并 uuid-2、uuid-3
- 组2：保留 uuid-5，合并 uuid-4
（注意：被合并的实体将被删除，不可恢复）"

用户："确认合并"

Agent：
  → POST /api/collections/3/graph/merge-entities
    {"source_entity_ids":["uuid-2","uuid-3"],"target_entity_id":"uuid-1"}
  → POST /api/collections/3/graph/merge-entities
    {"source_entity_ids":["uuid-4"],"target_entity_id":"uuid-5"}

Agent："正在验证修复结果..."
  → GET /api/collections/3/graph/dangling-relationships → 0条
  → GET /api/collections/3/graph/orphan-entities → 0个
  → GET /api/collections/3/graph/similar-entities?mode=llm → 0组

Agent："巡检完成！图谱已干净 ✅
- 已清理：3 条悬空关系 + 1 个孤立实体
- 已合并：'项目管理部' 3个 → 1个，'HR' → '人力资源部'"
```