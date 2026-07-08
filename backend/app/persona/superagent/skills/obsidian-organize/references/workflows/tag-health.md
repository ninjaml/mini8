# Workflow：tag 健康

本 workflow 只负责发现 tag 问题，不执行修正。

tag 健康分为三类问题。三类问题的流程不同，必须分开判断。

## 盘点方式

第一类和第二类问题开始前，先询问用户采用哪种盘点方式：

1. 快速抽样
2. 完整盘点

快速抽样：

- 用 Omnisearch 搜 tag 关键词召回候选文档。
- 对候选文档用结构化读取检查 `tags` 字段。
- 过滤掉不包含目标 tag 的文档。
- 读取过滤后的前 5 篇；不足 5 篇则全部读取。
- 适合快速判断 tag 是否有明显问题。

完整盘点：

- 使用 Local REST API `POST {vault.rest_base_url}/search/` 按 tag 严格查询全部文档。
- 读取该 tag 下所有文档。
- 适合正式清查和输出完整问题清单。

不能直接把 Omnisearch 返回结果当成 tag 下文档，必须再检查结构化 `tags` 字段。

第三类“错误 tag”是全局文档检查，不默认使用上面的 tag 抽样方式。开始前先询问用户是否针对特定 tag 检查错误使用。

## 可用动作

### 获取全部 tag

```http
GET {vault.rest_base_url}/tags/
```

用途：获取 tag 名称和计数。

### 快速抽样获取 tag 文档

第一步，用 Omnisearch 召回候选：

```http
GET {vault.omnisearch_url}/search?q={query}
```

其中 `{query}` 使用目标 tag 文本。

第二步，对候选结果逐篇结构化读取，并过滤 `tags`：

```http
GET {vault.rest_base_url}/vault/{filename}
Accept: application/vnd.olrapi.note+json
```

只保留结构化返回中 `tags` 包含目标 tag 的文档。读取过滤后的前 5 篇；不足 5 篇则全部读取。

### 完整盘点获取 tag 文档

```http
POST {vault.rest_base_url}/search/
Content-Type: application/vnd.olrapi.jsonlogic+json
```

Body：

```json
{
  "in": [
    "目标tag",
    {"var": "tags"}
  ]
}
```

用途：严格获取包含目标 tag 的全部文档。

### 结构化读取文档

```http
GET {vault.rest_base_url}/vault/{filename}
Accept: application/vnd.olrapi.note+json
```

用途：读取 `content`、`frontmatter`、`tags`、`path` 等结构化信息。

### 列出盘点范围文档

根目录：

```http
GET {vault.rest_base_url}/vault/
```

指定目录：

```http
GET {vault.rest_base_url}/vault/{pathToDirectory}/
```

用途：全局或目录范围盘点时列出 Markdown 文档。

### 近义 tag 候选算法

本地算法，不是 API：

- lowercase。
- 去掉 `-`、`_`、空格。
- 拆分 token。
- 比较 token 重叠。
- 比较编辑距离。
- 将中英文、缩写候选标记为人工确认。

## 1. tag 的检索价值和分类价值不足

### 目标

发现对检索、分类和后续关系建立帮助不大的 tag。

### 发现流程

1. 确定盘点范围。
2. 用 `GET {vault.rest_base_url}/tags/` 获取全部 tag 和计数。
3. 找出候选 tag：过宽、过短、过抽象、低复用或命名含糊的 tag。
4. 按用户选择的盘点方式获取该 tag 下的文档。
   快速抽样：用 Omnisearch `GET {vault.omnisearch_url}/search?q={query}` 召回候选，`{query}` 使用目标 tag，再结构化读取并过滤真实 `tags`。
   完整盘点：用 Local REST API `POST {vault.rest_base_url}/search/` 按 tag 严格查询全部文档，请求头为 `Content-Type: application/vnd.olrapi.jsonlogic+json`。
5. 对候选文档调用 `GET {vault.rest_base_url}/vault/{filename}`，用 `Accept: application/vnd.olrapi.note+json` 读取结构化内容。
6. 判断该 tag 下文档是否有清晰共同主题。
7. 输出检索价值和分类价值不足的 tag 清单。

### 判断依据

- tag 下文档主题分散。
- tag 太泛，无法帮助检索。
- tag 名称看不出领域或对象。
- tag 只出现一次且没有明显复用价值。

### 输出

- 问题 tag。
- 使用次数。
- 涉及文档。
- 判断依据。
- 建议：保留、拆分、替换或人工复核。

## 2. 同义 / 近义 tag

### 目标

发现表达相同或高度相近含义的多个 tag。

### 发现流程

1. 用 `GET {vault.rest_base_url}/tags/` 获取所有 tag 和计数。
2. 用近义 tag 候选算法生成候选组：统一大小写、去掉连接符和空格、拆分 token、比较 token 重叠和编辑距离。
3. 按用户选择的盘点方式分别获取这些 tag 下的文档。
   快速抽样：用 Omnisearch `GET {vault.omnisearch_url}/search?q={query}` 召回候选，`{query}` 使用目标 tag，再结构化读取并过滤真实 `tags`。
   完整盘点：用 Local REST API `POST {vault.rest_base_url}/search/` 按 tag 严格查询全部文档，请求头为 `Content-Type: application/vnd.olrapi.jsonlogic+json`。
4. 对候选文档调用 `GET {vault.rest_base_url}/vault/{filename}`，用 `Accept: application/vnd.olrapi.note+json` 读取结构化内容。
5. 判断这些 tag 是否表达同一主题。
6. 输出同义 / 近义 tag 组。

### 判断依据

- tag 字符串高度相似。
- tag token 组合相似。
- tag 下文档主题高度重叠。
- 中英文或缩写表达同一概念。

### 输出

- tag 候选组。
- 每个 tag 的使用次数。
- 涉及文档。
- 判断依据。
- 建议主 tag。
- 需要人工确认的歧义。

## 3. 错误 tag

### 目标

发现文档当前 tag 与正文主题明显不匹配的问题。

### 发现流程

1. 确定盘点范围。
2. 询问用户是否针对特定 tag 检查错误使用。
3. 如果用户指定 tag，只检查包含该 tag 的文档。
4. 如果用户不指定 tag，则按盘点范围做全局检查。
5. 如果用户指定 tag，用 Local REST API `POST {vault.rest_base_url}/search/` 按 tag 严格查询包含该 tag 的文档，请求头为 `Content-Type: application/vnd.olrapi.jsonlogic+json`。
6. 如果用户不指定 tag，用 `GET {vault.rest_base_url}/vault/` 和 `GET {vault.rest_base_url}/vault/{pathToDirectory}/` 获取盘点范围内文档。
7. 对待检查文档调用 `GET {vault.rest_base_url}/vault/{filename}`，用 `Accept: application/vnd.olrapi.note+json` 读取结构化信息。
8. 读取 `content` 和 `tags`。
9. 分析正文核心主题。
10. 将正文主题和当前 tags 对比。
11. 必要时用 `GET {vault.rest_base_url}/tags/` 读取已有 tag 列表，寻找更匹配的候选 tag。
12. 输出疑似错误 tag。

### 判断依据

- tag 与正文核心主题冲突。
- tag 指向错误项目、错误工具或错误领域。
- 文档已有更准确的候选 tag。
- 当前 tag 可能是历史遗留。

### 输出

- 文档路径。
- 当前 tag。
- 疑似错误 tag。
- 正文主题依据。
- 候选替代 tag。
- 置信度：高 / 中 / 低。
- 需要人工确认的事项。
