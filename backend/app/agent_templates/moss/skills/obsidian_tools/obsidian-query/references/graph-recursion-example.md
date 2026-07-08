# 图谱递归示例

本示例使用 Obsidian Local REST API 实现图谱递归查询。

依赖：

```bash
pip install requests
```

约定：

- `down`：向下查询子图谱，沿出链扩展。
- `up`：向上追踪父级，沿入链扩展。
- `both`：双向邻域，同时沿出链和入链扩展。
- 最大层级为 10。
- 使用 `visited` 避免循环。

```python
import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import quote

import requests

Direction = Literal["down", "up", "both"]
EdgeType = Literal["wikilink", "embed"]

WIKILINK_RE = re.compile(r"(?P<embed>!)?\[\[(?P<target>[^\]|#]+)(?:[|#][^\]]+)?\]\]")


@dataclass(frozen=True)
class Link:
    path: str
    type: EdgeType


@dataclass(frozen=True)
class Edge:
    from_path: str
    to_path: str
    type: EdgeType
    source: str = "body"


@dataclass(frozen=True)
class UnresolvedLink:
    source_path: str
    target: str
    type: EdgeType
    reason: str


TargetIndex = dict[str, list[str]]


class ObsidianRestClient:
    def __init__(self, rest_base_url: str, api_key: str):
        self.rest_base_url = rest_base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {api_key}"})

    def list_dir(self, directory: str = "") -> list[str]:
        path = quote(directory, safe="/")
        url = f"{self.rest_base_url}/vault/{path}"
        if directory and not url.endswith("/"):
            url += "/"

        response = self.session.get(url)
        response.raise_for_status()
        return response.json()["files"]

    def list_all_markdown_files(self, directory: str = "") -> list[str]:
        result: list[str] = []

        for item in self.list_dir(directory):
            full_path = f"{directory}{item}" if directory else item

            if full_path.endswith("/"):
                result.extend(self.list_all_markdown_files(full_path))
            elif full_path.endswith(".md"):
                result.append(full_path)

        return result

    def read_note(self, path: str) -> str:
        encoded = quote(path, safe="/")
        url = f"{self.rest_base_url}/vault/{encoded}"
        response = self.session.get(url)
        response.raise_for_status()
        return response.text


def query_graph(
    client: ObsidianRestClient,
    starts: list[str],
    direction: Direction,
    depth: int,
) -> dict:
    max_depth = min(max(depth, 1), 10)

    all_paths = client.list_all_markdown_files()
    target_index = build_target_index(all_paths)
    unresolved: list[UnresolvedLink] = []
    outgoing_index = build_outgoing_index(client, all_paths, target_index, unresolved)
    incoming_index = build_incoming_index(outgoing_index)

    visited: set[str] = set()
    nodes: set[str] = set()
    edges: list[Edge] = []
    frontier = normalize_start_paths(starts, target_index)

    for _level in range(1, max_depth + 1):
        next_frontier: set[str] = set()

        for path in frontier:
            if path in visited:
                continue

            visited.add(path)
            nodes.add(path)

            outgoing = outgoing_index.get(path, [])
            incoming = incoming_index.get(path, [])

            if direction == "down":
                selected = outgoing
            elif direction == "up":
                selected = incoming
            else:
                selected = outgoing + incoming

            for edge in selected:
                edges.append(edge)
                nodes.add(edge.from_path)
                nodes.add(edge.to_path)

                next_node = edge.to_path if edge.from_path == path else edge.from_path
                if next_node not in visited:
                    next_frontier.add(next_node)

        if not next_frontier:
            break

        frontier = sorted(next_frontier)

    return {
        "nodes": sorted(nodes),
        "edges": [edge_to_dict(edge) for edge in dedupe_edges(edges)],
        "unresolved_links": [unresolved_link_to_dict(link) for link in unresolved],
    }


def build_outgoing_index(
    client: ObsidianRestClient,
    all_paths: list[str],
    target_index: TargetIndex,
    unresolved: list[UnresolvedLink],
) -> dict[str, list[Edge]]:
    index: dict[str, list[Edge]] = {}

    for path in all_paths:
        content = client.read_note(path)
        links = parse_links(content, path, target_index, unresolved)
        index[path] = [
            Edge(from_path=path, to_path=link.path, type=link.type)
            for link in links
        ]

    return index


def build_incoming_index(outgoing_index: dict[str, list[Edge]]) -> dict[str, list[Edge]]:
    incoming: dict[str, list[Edge]] = {}

    for edges in outgoing_index.values():
        for edge in edges:
            incoming.setdefault(edge.to_path, []).append(edge)

    return incoming


def parse_links(
    content: str,
    source_path: str,
    target_index: TargetIndex,
    unresolved: list[UnresolvedLink],
) -> list[Link]:
    links: list[Link] = []

    for match in WIKILINK_RE.finditer(content):
        raw_target = match.group("target").strip()
        link_type: EdgeType = "embed" if match.group("embed") else "wikilink"
        target_path = resolve_target(raw_target, target_index)

        if target_path:
            links.append(Link(path=target_path, type=link_type))
        else:
            unresolved.append(
                UnresolvedLink(
                    source_path=source_path,
                    target=raw_target,
                    type=link_type,
                    reason="target-not-found-or-ambiguous",
                )
            )

    return links


def resolve_target(target: str, target_index: TargetIndex) -> str | None:
    candidates = target_index.get(target, [])

    if len(candidates) == 1:
        return candidates[0]

    # No match means dangling link; multiple matches means ambiguous wikilink.
    # Both cases must be reported instead of silently choosing a target.
    return None


def build_target_index(paths: list[str]) -> TargetIndex:
    index: TargetIndex = {}

    # Obsidian wikilinks often use the shortest readable target rather than
    # the full vault-relative path. To approximate that behavior without
    # Obsidian's internal metadata cache, register several keys for each file:
    # full path, path without .md, basename, and basename without .md.
    for path in paths:
        basename = path.rsplit("/", 1)[-1]
        stem_path = path.removesuffix(".md")
        stem_name = basename.removesuffix(".md")

        for key in {path, stem_path, basename, stem_name}:
            index.setdefault(key, []).append(path)

    return index


def normalize_start_paths(starts: list[str], target_index: TargetIndex) -> list[str]:
    result: list[str] = []

    for start in starts:
        resolved = resolve_target(start, target_index)
        if resolved:
            result.append(resolved)

    return list(dict.fromkeys(result))


def dedupe_edges(edges: list[Edge]) -> list[Edge]:
    seen: set[tuple[str, str, str]] = set()
    result: list[Edge] = []

    for edge in edges:
        key = (edge.from_path, edge.to_path, edge.type)
        if key in seen:
            continue

        seen.add(key)
        result.append(edge)

    return result


def edge_to_dict(edge: Edge) -> dict:
    return {
        "from": edge.from_path,
        "to": edge.to_path,
        "type": edge.type,
        "source": edge.source,
    }


def unresolved_link_to_dict(link: UnresolvedLink) -> dict:
    return {
        "source": link.source_path,
        "target": link.target,
        "type": link.type,
        "reason": link.reason,
    }


if __name__ == "__main__":
    client = ObsidianRestClient(
        rest_base_url="http://localhost:27123",
        api_key="YOUR_API_KEY",
    )

    graph = query_graph(
        client=client,
        starts=["A.md"],
        direction="down",
        depth=2,
    )

    print(graph)
```

注意：

- `GET {vault.rest_base_url}/vault/` 和 `GET {vault.rest_base_url}/vault/{pathToDirectory}/` 用于递归列出 Markdown 文件。
- `GET {vault.rest_base_url}/vault/{filename}` 用于读取文档正文。
- 出链来自当前文档正文中的 `[[wikilink]]` 和 `![[embed]]`。
- 入链通过反转全量出链索引得到。
- 无法解析的 wikilink 会进入 `unresolved_links`，不能静默丢弃。
- 目标解析使用全局目标索引：完整路径、去掉 `.md` 的路径、文件名、去掉 `.md` 的文件名都会登记为 key。
- 同名文档会形成多个候选，不能强行选择，必须进入 `unresolved_links`。
