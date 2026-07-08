from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class LoadedRuntimeConfig:
    identity_text: str
    agent_rules_text: str
    tools_text: str
    skill_source_dirs: list[Path]


def load_runtime_config(
    *,
    base_agent_dir: Path,
    prompt_overlay: str | None,
    scope_context: str | None,
    skill_source_dirs: list[Path],
) -> LoadedRuntimeConfig:
    identity_text = (base_agent_dir / "identity.md").read_text(encoding="utf-8").strip()
    base_rules_path = base_agent_dir / "agent.md"
    if not base_rules_path.exists():
        raise FileNotFoundError(f"Base agent rules not found: {base_rules_path}")
    base_rules = base_rules_path.read_text(encoding="utf-8").strip()
    tools_text = (base_agent_dir / "tools.md").read_text(encoding="utf-8").strip()
    composed_rules = "\n\n".join(part for part in [base_rules, prompt_overlay, scope_context] if part)
    return LoadedRuntimeConfig(
        identity_text=identity_text,
        agent_rules_text=composed_rules,
        tools_text=tools_text,
        skill_source_dirs=skill_source_dirs,
    )
