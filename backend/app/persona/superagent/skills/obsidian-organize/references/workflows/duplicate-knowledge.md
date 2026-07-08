# Workflow：重复知识

本 workflow 只负责发现重复知识，不主动合并、不删除、不修改文档。

重复知识分为两类入口：标题近似和内容近似。找到候选文档后，直接读取候选内容交给大模型判断是否重复、互补、旧版本或只是主题相关。

## 开始前确认

如果用户没有说清楚，先确认检查范围。以下 5 种都是范围，只是候选获取方式不同：

1. 全局。
2. 指定 tag。
3. 指定目录。
4. 指定主题 / 关键词。
5. 指定文档，查找相似文档。

全局盘点成本最高。用户没有明确要求全局时，不要默认全库深度比较。

本文档中的“文档数量可控”默认指 20 篇以内；超过 20 篇时，提醒用户文档过多可能导致超出上下文并影响执行结果，推荐用户缩小范围、指定主题或指定种子文档。如果用户明确坚持继续，则继续执行。

不同范围的候选获取方式：

- 全局：用 `GET {vault.rest_base_url}/vault/` 和 `GET {vault.rest_base_url}/vault/{pathToDirectory}/` 列出全库 Markdown 文件，再做标题近似；内容近似不默认全库两两比较。
- 指定 tag：用 `POST {vault.rest_base_url}/search/` 严格获取该 tag 下文档；20 篇以内读取全部交给大模型判断，超过 20 篇时提醒上下文风险并推荐缩小范围，如果用户坚持则继续。
- 指定目录：用 `GET {vault.rest_base_url}/vault/{pathToDirectory}/` 递归获取目录下 Markdown 文件；20 篇以内读取全部交给大模型判断，超过 20 篇时提醒上下文风险并推荐缩小范围，如果用户坚持则继续。
- 指定主题 / 关键词：直接把主题 / 关键词作为 `{query}`，用 Omnisearch `GET {vault.omnisearch_url}/search?q={query}` 召回候选。
- 指定文档：先用 `GET {vault.rest_base_url}/vault/{filename}` 和 `Accept: application/vnd.olrapi.note+json` 读取该文档，提取查询语句，再用 Omnisearch `GET {vault.omnisearch_url}/search?q={query}` 召回候选。

指定主题 / 关键词和指定文档依赖相似召回。未配置 Omnisearch 时，可以降级使用 Local REST API `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}`，但必须说明召回质量下降。

## 可用动作

### 列出盘点范围文档

全局：

```http
GET {vault.rest_base_url}/vault/
```

指定目录：

```http
GET {vault.rest_base_url}/vault/{pathToDirectory}/
```

遇到目录时递归调用 `GET {vault.rest_base_url}/vault/{pathToDirectory}/`，只保留 `.md` 文件。

指定 tag：

```http
POST {vault.rest_base_url}/search/
Content-Type: application/vnd.olrapi.jsonlogic+json
```

```json
{
  "in": [
    "目标tag",
    {"var": "tags"}
  ]
}
```

### 结构化读取文档

```http
GET {vault.rest_base_url}/vault/{filename}
Accept: application/vnd.olrapi.note+json
```

用途：读取 `content`、`frontmatter`、`tags`、`path`。

### 相似内容召回

优先使用 Omnisearch：

```http
GET {vault.omnisearch_url}/search?q={query}
```

未配置 Omnisearch 时降级使用：

```http
POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}
```

降级搜索只能作为候选提示，不等价于 Omnisearch 的相似召回。

### 内容候选生成规则

- 指定主题 / 关键词：用 Omnisearch 召回候选。
- 指定文档：读取该文档后提取查询语句，用 Omnisearch 召回候选。
- 指定 tag / 指定目录：20 篇以内可以读取全部交给大模型判断；超过 20 篇时提醒上下文风险并推荐缩小范围，如果用户坚持则继续。
- 全局：不做全库内容两两比较；必须先缩小范围，或改用指定主题 / 指定文档召回。

### 标题近似判断

标题近似不需要复杂算法。把检查范围内的文件名和路径交给大模型，由大模型直接找出看起来像同一主题、同一对象或同一知识点的候选组。

如果文档数量很多，先按目录、tag 或文件名分批判断，再合并候选组。

## 1. 标题近似

### 目标

发现标题很像、可能记录同一知识点的文档。

### 发现流程

1. 按用户选择的范围列出待检查文档。
   全局或目录使用 `GET {vault.rest_base_url}/vault/`、`GET {vault.rest_base_url}/vault/{pathToDirectory}/`；指定 tag 使用 `POST {vault.rest_base_url}/search/`，请求头为 `Content-Type: application/vnd.olrapi.jsonlogic+json`；指定文档直接使用用户给出的路径。
2. 把文件名和路径交给大模型，直接判断标题是否近似，生成候选组。
3. 对候选组内文档调用 `GET {vault.rest_base_url}/vault/{filename}`，用 `Accept: application/vnd.olrapi.note+json` 读取结构化内容。
4. 比较正文主题、结论、关键概念和 tags。
5. 输出疑似标题重复组。

### 判断依据

- 标题看起来高度相似。
- 正文讨论同一对象或同一问题。
- 文档结论高度重叠。
- tags 高度重合。

只标题相似但内容不同，标记为“标题相似但不重复”。

## 2. 内容近似

### 目标

发现标题不同但内容高度相似的文档。

### 发现流程

1. 按用户选择的范围确定候选生成方式。
2. 如果是指定主题 / 关键词，直接作为 `{query}`，用 Omnisearch `GET {vault.omnisearch_url}/search?q={query}` 召回候选。
3. 如果是指定文档，先用 `GET {vault.rest_base_url}/vault/{filename}` 和 `Accept: application/vnd.olrapi.note+json` 读取正文，提取查询语句，再用 Omnisearch 召回候选。
4. 如果是指定 tag 或指定目录，20 篇以内读取范围内全部文档交给大模型判断；超过 20 篇时提醒用户文档过多可能导致超出上下文并影响执行结果，推荐缩小范围；如果用户明确坚持继续，则继续执行。
5. 如果是全局范围，不做全库内容两两比较；先要求用户缩小范围，或改用指定主题 / 指定文档。
6. 未配置 Omnisearch 时，用 Local REST API `POST {vault.rest_base_url}/search/simple/?query={query}&contextLength={contextLength}` 降级召回，并说明召回质量下降。
7. 对候选文档结构化读取正文和 tags。
8. 比较正文主题、知识点、结论和例子。
9. 输出疑似内容重复组。

### 判断依据

- 多篇文档包含相同知识点。
- 结论、定义、步骤或案例高度重合。
- 一篇文档是另一篇的改写、旧版本或碎片摘录。
- 只有主题相关但知识点互补时，不判定为重复。

## 输出要求

每个重复候选组必须输出：

- 重复类型：标题近似 / 内容近似。
- 涉及文档。
- 共同主题。
- 重复证据。
- 差异点。
- 大模型判断：重复 / 互补 / 旧版本 / 只是主题相关 / 无法确定。
- 置信度：高 / 中 / 低。
- 建议处理方向：合并、保留并建立关系、标记旧文档、人工复核。

## 禁止行为

- 不自动删除文档。
- 不自动合并正文。
- 不在没有用户明确修复指令时调用 `PATCH` 或 `PUT`。
