---
name: mini8-market-api
description: Use when a user describes a business need and needs an agent to search the mini8 market, recommend matching skills or prompt templates, inspect details, or download a selected published skill package through the public market API.
---

# mini8 市场资源检索

把用户的业务想法转成检索动作，找到可用资源；只使用公开读取接口。

## 硬规则

- 只推荐 `status=enable` 的 skill。
- 不调用登录、创建、上传、发布、禁用、编辑、删除、绑标签接口。
- 不展示 `file_path`；下载只能使用公开下载接口。
- 不编造结果；没找到就明确说没找到。

## 查询机制

先识别用户意图：业务问题、关键动作、资源类型、可能分类。

Skill 检索按置信度降级，上一层够用就停止：

1. `tag`：先查分类，选最匹配分类，再查该分类下的已发布 skill。
2. `summary`：tag 结果为空、太泛或不匹配时，用核心业务词查摘要。
3. `chinese_name`：summary 不够时查中文名。
4. `slug`：中文名还不够时查英文标识。
5. 四层都没有高置信结果：告诉用户当前市场没有匹配 skill。

Prompt 同理降级：

```text
tag -> summary -> name -> content
```

## 判断候选

推荐前必须看详情：

判断字段：
- `summary`
- `use_for`
- `not_for`
- `skill_installation`
- `dependency_installation`
- `tags`

## 输出

推荐 skill 时给：
- `id`
- `slug`
- `chinese_name`
- `summary`
- 匹配理由
- 不适用风险
- 安装/依赖要点

用户确认下载时：
调用下载接口获取 zip 包。

## 参考

接口定义见 [references/public-api.md](references/public-api.md)。
