from pydantic import BaseModel


class EnterpriseSearchRequest(BaseModel):
    query: str
    primary_key: str
    collection_ids: list[int] | None = None
    limit: int = 10
    use_hybrid_search: bool = False
    use_graph_search: bool = False
    graph_limits: dict | None = None
