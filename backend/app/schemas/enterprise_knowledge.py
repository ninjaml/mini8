"""企业知识检索/RAG 请求模型。

这层 schema 服务的是 enterprise knowledge 这条全局知识引擎链路，
与 workspace 本地挂载的 ``WorkKnowledge`` 不是一回事。

从 ``api/knowledge.py`` 和 ``services/enterprise_knowledge.py`` 的调用链可以确认：
- ``EnterpriseSearchRequest`` 同时用于 ``/enterprise/search`` 和 ``/enterprise/rag``。
- 大部分字段会直接转发给 R2R 请求体。
- ``collection_ids`` 在 API 层会先从 ``list[int]`` 转成 ``list[str]``，
  到 service 层再转回 ``list[int]`` 塞进最终 payload。
- ``graph_limits`` 只有在 ``use_graph_search=True`` 时才真正参与下游请求。
"""

from pydantic import BaseModel


class EnterpriseSearchRequest(BaseModel):
    """企业知识检索/RAG 的统一请求体。

    使用方：
    - ``POST /enterprise/search``
    - ``POST /enterprise/rag``

    这个模型没有区分 search 与 rag 两条接口的字段，
    因为两边当前共享同一套检索参数，只是在 service 层调用不同下游端点。
    """
    # 用户输入的检索/RAG 查询文本。
    query: str
    # 业务用户标识。
    # service 层会把它拼进 Authorization: Bearer dev:{primary_key}，
    # 用来代表当前用户访问 R2R。
    primary_key: str
    # 需要限定的知识集合 ID 列表。
    # API 层先把 int 列表转成 str 列表，service 层再转回 int 列表放进最终请求体。
    collection_ids: list[int] | None = None
    # 结果数量上限；当前默认 10。
    limit: int = 10
    # 是否启用 hybrid search。
    use_hybrid_search: bool = False
    # 是否启用 graph search。
    # 只有为 True 时，graph_limits 才会真正写入下游 payload。
    use_graph_search: bool = False
    # graph search 的限额配置。
    # 当前约定支持 entity / relationship / community 三个键；
    # 若缺省，service 层会分别回退到 10 / 10 / 5。
    graph_limits: dict | None = None
