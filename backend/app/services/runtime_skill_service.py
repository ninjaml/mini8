from pathlib import Path
import re


def _parse_skill_md(skill_md_path: Path) -> dict | None:
    """从 ``SKILL.md`` 头部 frontmatter 提取最小元信息。

    当前解析器很轻量：
    - 只认文件开头的 frontmatter
    - 只提取单行 ``key: value`` 形式
    - 至少要有 ``name`` 和 ``description`` 两个字段
    """
    try:
        content = skill_md_path.read_text(encoding="utf-8")
        frontmatter_pattern = r"^---\s*\n(.*?)\n---\s*\n"
        match = re.match(frontmatter_pattern, content, re.DOTALL)
        if not match:
            return None

        frontmatter = match.group(1)
        metadata: dict[str, str] = {}
        for line in frontmatter.split("\n"):
            kv_match = re.match(r"^(\w+):\s*(.+)$", line.strip())
            if kv_match:
                key, value = kv_match.groups()
                metadata[key] = value.strip()

        if "name" not in metadata or "description" not in metadata:
            return None

        return {
            "name": metadata["name"],
            "description": metadata["description"],
            "path": str(skill_md_path),
        }
    except (OSError, UnicodeDecodeError):
        return None


def _merge_skill_dir(skills_by_name: dict[str, dict], source_dir: Path) -> None:
    """扫描目录下的一层技能子目录，并按技能名写入索引。

    若多个来源出现同名技能，后写入者会覆盖先写入者。
    """
    if not source_dir.exists():
        return
    for skill_subdir in sorted(source_dir.iterdir()):
        if not skill_subdir.is_dir():
            continue
        skill_md = skill_subdir / "SKILL.md"
        if not skill_md.exists():
            continue
        meta = _parse_skill_md(skill_md)
        if meta:
            skills_by_name[meta["name"]] = meta


def build_runtime_skill_catalog(
    source_dirs: list[Path],
    *,
    project_skills_dir: Path | None = None,
) -> list[dict]:
    """构建运行时技能目录清单。

    返回值里的 ``path`` 指向具体 ``SKILL.md`` 文件，
    供前端展示或后续按文件继续读取，而不是技能目录本身。
    """
    skills_by_name: dict[str, dict] = {}

    for source_dir in source_dirs:
        _merge_skill_dir(skills_by_name, source_dir)

    if project_skills_dir is not None:
        _merge_skill_dir(skills_by_name, project_skills_dir)

    return list(skills_by_name.values())
