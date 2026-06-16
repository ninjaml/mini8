"""Configuration, constants, and model creation for the CLI."""

import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

import dotenv
from langchain_core.language_models import BaseChatModel

from app.core.config import settings as camphor_settings


dotenv.load_dotenv()

# Agent configuration
config = {"recursion_limit": 1000}


def _find_project_root(start_path: Path | None = None) -> Path | None:
    """Find the project root by looking for .git directory.

    Walks up the directory tree from start_path (or cwd) looking for a .git
    directory, which indicates the project root.

    Args:
        start_path: Directory to start searching from. Defaults to current working directory.

    Returns:
        Path to the project root if found, None otherwise.
    """
    current = Path(start_path or Path.cwd()).resolve()

    # Walk up the directory tree
    for parent in [current, *list(current.parents)]:
        git_dir = parent / ".git"
        if git_dir.exists():
            return parent

    return None

@dataclass
class Settings:
    """Global settings and environment detection for mini8-cli.

    This class is initialized once at startup and provides access to:
    - Available models and API keys
    - Current project information
    - Tool availability (e.g., Tavily)
    - File system paths

    Attributes:
        project_root: Current project root directory (if in a git project)

        openai_api_key: OpenAI API key if available
        anthropic_api_key: Anthropic API key if available
        google_api_key: Google API key if available
        deepseek_api_key: DeepSeek API key if available
        tavily_api_key: Tavily API key if available
    """

    # API keys
    openai_api_key: str | None
    anthropic_api_key: str | None
    google_api_key: str | None
    tavily_api_key: str | None
    deepseek_api_key: str | None
    siliconflow_api_key: str | None
    kimi_api_key: str | None
    zhipu_api_key: str | None
    qwen_api_key: str | None
    minimax_api_key: str | None

    # Project information
    project_root: Path | None

    @classmethod
    def from_environment(cls, *, start_path: Path | None = None) -> "Settings":
        """Create settings by detecting the current environment.

        优先从数据库加载 API keys，如果数据库中没有则从环境变量加载。

        Args:
            start_path: Directory to start project detection from (defaults to cwd)

        Returns:
            Settings instance with detected configuration
        """
        # 从数据库加载 API keys
        db_keys = {}
        try:
            from deepagents_webapi.session.env_manager import EnvManager
            env_manager = EnvManager()
            db_keys = env_manager.get_all_configured_keys()
        except Exception:
            pass  # 数据库不可用时回退到环境变量

        # 双重来源：数据库优先（按 provider 查），环境变量作为回退
        openai_key = db_keys.get("openai") or os.environ.get("OPENAI_API_KEY")
        anthropic_key = db_keys.get("anthropic") or os.environ.get("ANTHROPIC_API_KEY")
        google_key = db_keys.get("google") or os.environ.get("GOOGLE_API_KEY")
        tavily_key = db_keys.get("tavily") or os.environ.get("TAVILY_API_KEY")
        deepseek_key = db_keys.get("deepseek") or os.environ.get("DEEPSEEK_API_KEY")
        siliconflow_key = db_keys.get("siliconflow") or os.environ.get("SILLICONFLOW_API_KEY")
        kimi_key = db_keys.get("kimi") or os.environ.get("MOONSHOT_API_KEY")
        zhipu_key = db_keys.get("zhipu") or os.environ.get("ZHIPU_API_KEY")
        qwen_key = db_keys.get("qwen") or os.environ.get("DASHSCOPE_API_KEY")
        minimax_key = db_keys.get("minimax") or os.environ.get("MINIMAX_API_KEY")

        # Detect project
        project_root = _find_project_root(start_path)

        return cls(
            openai_api_key=openai_key,
            anthropic_api_key=anthropic_key,
            google_api_key=google_key,
            tavily_api_key=tavily_key,
            project_root=project_root,
            deepseek_api_key=deepseek_key,
            siliconflow_api_key=siliconflow_key,
            kimi_api_key=kimi_key,
            zhipu_api_key=zhipu_key,
            qwen_api_key=qwen_key,
            minimax_api_key=minimax_key,
        )

    @property
    def has_openai(self) -> bool:
        """Check if OpenAI API key is configured."""
        return self.openai_api_key is not None

    @property
    def has_anthropic(self) -> bool:
        """Check if Anthropic API key is configured."""
        return self.anthropic_api_key is not None

    @property
    def has_google(self) -> bool:
        """Check if Google API key is configured."""
        return self.google_api_key is not None
    
    @property
    def has_deepseek(self) -> bool:
        """Check if DeepSeek API key is configured."""
        return self.deepseek_api_key is not None
    
    @property
    def has_siliconflow(self) -> bool:
        """Check if SiliconFlow API key is configured."""
        return self.siliconflow_api_key is not None

    @property
    def has_kimi(self) -> bool:
        """Check if Kimi (Moonshot) API key is configured."""
        return self.kimi_api_key is not None

    @property
    def has_zhipu(self) -> bool:
        """Check if Zhipu (GLM) API key is configured."""
        return self.zhipu_api_key is not None

    @property
    def has_qwen(self) -> bool:
        """Check if Qwen (DashScope) API key is configured."""
        return self.qwen_api_key is not None

    @property
    def has_minimax(self) -> bool:
        """Check if MiniMax API key is configured."""
        return self.minimax_api_key is not None

    @property
    def is_multimodal(self) -> bool:
        """Check if the current active model supports multimodal input."""
        # Kimi、Qwen-VL 支持多模态；智谱 GLM-5 纯文本；DeepSeek 纯文本
        return self.has_kimi or self.has_qwen

    @property
    def has_tavily(self) -> bool:
        """Check if Tavily API key is configured."""
        return self.tavily_api_key is not None

    @property
    def has_project(self) -> bool:
        """Check if currently in a git project."""
        return self.project_root is not None

    @property
    def user_deepagents_dir(self) -> Path:
        """Get the CamphorOS runtime agents directory.

        Returns:
            Path to data/runtime/agents
        """
        return camphor_settings.RUNTIME_AGENTS_DIR

    def get_user_agent_md_path(self, agent_name: str) -> Path:
        """Get user-level agent.md path for a specific agent.

        Returns path regardless of whether the file exists.

        Args:
            agent_name: Name of the agent

        Returns:
            Path to data/runtime/agents/{agent_name}/agent.md
        """
        return self.user_deepagents_dir / agent_name / "agent.md"

    def get_project_agent_md_path(self) -> Path | None:
        """Get project-level agent.md path.

        Returns path regardless of whether the file exists.

        Returns:
            Path to {project_root}/.mini8/agent.md, or None if not in a project
        """
        if not self.project_root:
            return None
        return self.project_root / ".mini8" / "agent.md"

    @staticmethod
    def _is_valid_agent_name(agent_name: str) -> bool:
        """Validate prevent invalid filesystem paths and security issues."""
        if not agent_name or not agent_name.strip():
            return False
        # Allow only alphanumeric, hyphens, underscores, and whitespace
        return bool(re.match(r"^[a-zA-Z0-9_\-\s]+$", agent_name))

    def get_agent_dir(self, agent_name: str) -> Path:
        """Get the global agent directory path.

        Args:
            agent_name: Name of the agent

        Returns:
            Path to ~/.mini8/{agent_name}
        """
        if not self._is_valid_agent_name(agent_name):
            msg = (
                f"Invalid agent name: {agent_name!r}. "
                "Agent names can only contain letters, numbers, hyphens, underscores, and spaces."
            )
            raise ValueError(msg)
        return self.user_deepagents_dir / agent_name

    def ensure_agent_dir(self, agent_name: str) -> Path:
        """Ensure the global agent directory exists and return its path.

        Args:
            agent_name: Name of the agent

        Returns:
            Path to ~/.mini8/{agent_name}
        """
        if not self._is_valid_agent_name(agent_name):
            msg = (
                f"Invalid agent name: {agent_name!r}. "
                "Agent names can only contain letters, numbers, hyphens, underscores, and spaces."
            )
            raise ValueError(msg)
        agent_dir = self.get_agent_dir(agent_name)
        agent_dir.mkdir(parents=True, exist_ok=True)
        return agent_dir

    def ensure_project_mini8_dir(self) -> Path | None:
        """Ensure the project .mini8 directory exists and return its path.

        Returns:
            Path to project .mini8 directory, or None if not in a project
        """
        if not self.project_root:
            return None

        project_deepagents_dir = self.project_root / ".mini8"
        project_deepagents_dir.mkdir(parents=True, exist_ok=True)
        return project_deepagents_dir

    def get_user_skills_dir(self, agent_name: str) -> Path:
        """Get user-level skills directory path for a specific agent.

        Args:
            agent_name: Name of the agent

        Returns:
            Path to ~/.mini8/{agent_name}/skills/
        """
        return self.get_agent_dir(agent_name) / "skills"

    def ensure_user_skills_dir(self, agent_name: str) -> Path:
        """Ensure user-level skills directory exists and return its path.

        Args:
            agent_name: Name of the agent

        Returns:
            Path to ~/.mini8/{agent_name}/skills/
        """
        skills_dir = self.get_user_skills_dir(agent_name)
        skills_dir.mkdir(parents=True, exist_ok=True)
        return skills_dir

    def get_project_skills_dir(self) -> Path | None:
        """Get project-level skills directory path.

        Returns:
            Path to {project_root}/.mini8/skills/, or None if not in a project
        """
        if not self.project_root:
            return None
        return self.project_root / ".mini8" / "skills"

    def ensure_project_skills_dir(self) -> Path | None:
        """Ensure project-level skills directory exists and return its path.

        Returns:
            Path to {project_root}/.mini8/skills/, or None if not in a project
        """
        if not self.project_root:
            return None
        skills_dir = self.get_project_skills_dir()
        skills_dir.mkdir(parents=True, exist_ok=True)
        return skills_dir

    def list_agents(self) -> list[str]:
        """列出所有已创建的 agent 名称。

        扫描 runtime agents 目录下包含 agent.md 的子目录。

        Returns:
            agent 名称列表
        """
        base = self.user_deepagents_dir
        if not base.exists():
            return []
        agents = []
        for d in sorted(base.iterdir()):
            if d.is_dir() and (d / "agent.md").exists():
                if self._is_valid_agent_name(d.name):
                    agents.append(d.name)
        return agents


# Global settings instance (lazy initialization to avoid circular imports)
_settings: Settings | None = None


def get_settings() -> Settings:
    """Get or create the global settings instance (lazy initialization)."""
    global _settings
    if _settings is None:
        _settings = Settings.from_environment()
    return _settings


# Backward compatibility: settings property
@property
def _settings_property() -> Settings:
    return get_settings()


# Create a module-level attribute that acts like the old settings
class _SettingsProxy:
    def __getattr__(self, name):
        return getattr(get_settings(), name)


settings = _SettingsProxy()


def reload_settings():
    """重新加载全局 settings（修改 API key 后调用）。"""
    global _settings
    _settings = Settings.from_environment()


class SessionState:
    """Holds mutable session state (auto-approve mode, etc)."""

    def __init__(self, auto_approve: bool = False, no_splash: bool = False) -> None:
        self.auto_approve = auto_approve
        self.no_splash = no_splash
        self.exit_hint_until: float | None = None
        self.exit_hint_handle = None
        self.thread_id = str(uuid.uuid4())

    def toggle_auto_approve(self) -> bool:
        """Toggle auto-approve and return new state."""
        self.auto_approve = not self.auto_approve
        return self.auto_approve


def get_default_identity() -> str:
    """Get the default identity template.
    
    Returns:
        Default identity.md content for new agents.
    """
    default_path = Path(__file__).parent / "prompt" / "default_identity.md"
    return default_path.read_text(encoding="utf-8")


def get_default_agent_rules() -> str:
    """Get the default agent rules template.
    
    Returns:
        Default agent.md content for new agents.
    """
    default_path = Path(__file__).parent / "prompt" / "default_agent.md"
    return default_path.read_text(encoding="utf-8")


def get_default_tools_description() -> str:
    """Get the default tools description template.
    
    Returns:
        Default tools.md content for new agents.
    """
    default_path = Path(__file__).parent / "prompt" / "default_tools.md"
    return default_path.read_text(encoding="utf-8")


def create_model() -> BaseChatModel:
    """Create the appropriate model based on available API keys.

    Uses the global settings instance to determine which model to create.

    Returns:
        ChatModel instance (OpenAI or Anthropic)

    Raises:
        SystemExit if no API key is configured
    """
    if settings.has_openai:
        from langchain_openai import ChatOpenAI

        model_name = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
        # console.print(f"[dim]Using OpenAI model: {model_name}[/dim]")
        return ChatOpenAI(
            model=model_name,
        )
    # 使用硅基流动里面的deepseek模型
    if settings.has_siliconflow:
        from langchain_openai import ChatOpenAI
        # console.print(f"[dim]Using siliconflow DeepSeek model: deepseek-ai/DeepSeek-V3.2[/dim]")
        return ChatOpenAI(
            model_name="deepseek-ai/DeepSeek-V3.2",
            api_key=settings.siliconflow_api_key,
            base_url="https://api.siliconflow.cn/v1"
        )
    if settings.has_kimi:
        from deepagents_webapi.model.kimi_reasoning_fix import ChatKimiWithReasoning
        return ChatKimiWithReasoning(
            model_name="kimi-k2.5",
            api_key=settings.kimi_api_key,
            base_url="https://api.moonshot.cn/v1"
        )
    if settings.has_zhipu:
        from deepagents_webapi.model.zhipu_reasoning_fix import ChatZhipuWithReasoning
        return ChatZhipuWithReasoning(
            model_name="glm-5",
            api_key=settings.zhipu_api_key,
            base_url="https://open.bigmodel.cn/api/paas/v4"
        )
    if settings.has_qwen:
        from deepagents_webapi.model.qwen_reasoning_fix import ChatQwenWithReasoning
        return ChatQwenWithReasoning(
            model_name="qwen3.5-plus",
            api_key=settings.qwen_api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
    if settings.has_minimax:
        from deepagents_webapi.model.minimax_model import ChatMinimax
        return ChatMinimax(
            model_name="MiniMax-M2.5",
            api_key=settings.minimax_api_key,
            base_url="https://api.minimax.chat/v1"
        )
    if settings.has_deepseek:
        from deepagents_webapi.model.deepseek_reasoning_fix import ChatDeepSeekWithFullReasoning
        return ChatDeepSeekWithFullReasoning(
            model_name="deepseek-reasoner",
            api_key=settings.deepseek_api_key,
            base_url="https://api.deepseek.com/v1"
        )
        # from langchain_deepseek import ChatDeepSeek
        # return ChatDeepSeek(
        #     model_name="deepseek-reasoner",
        #     api_key=settings.deepseek_api_key,
        #     base_url="https://api.deepseek.com/v1"
        # )
    if settings.has_anthropic:
        from langchain_anthropic import ChatAnthropic

        model_name = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
        # console.print(f"[dim]Using Anthropic model: {model_name}[/dim]")
        return ChatAnthropic(
            model_name=model_name,
            # The attribute exists, but it has a Pydantic alias which
            # causes issues in IDEs/type checkers.
            max_tokens=20_000,  # type: ignore[arg-type]
        )
    if settings.has_google:
        from langchain_google_genai import ChatGoogleGenerativeAI

        model_name = os.environ.get("GOOGLE_MODEL", "gemini-3-pro-preview")
        # console.print(f"[dim]Using Google Gemini model: {model_name}[/dim]")
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=0,
            max_tokens=None,
        )
    # console.print("[bold red]Error:[/bold red] No API key configured.")
    # console.print("\nPlease set one of the following environment variables:")
    # console.print("  - OPENAI_API_KEY     (for OpenAI models like gpt-5-mini)")
    # console.print("  - ANTHROPIC_API_KEY  (for Claude models)")
    # console.print("  - GOOGLE_API_KEY     (for Google Gemini models)")
    # console.print("  - DEEPSEEK_API_KEY   (for DeepSeek models)")
    # console.print("  - SILLICONFLOW_API_KEY (for SiliconFlow DeepSeek models)")
    # console.print("\nExample:")
    # console.print("  export OPENAI_API_KEY=your_api_key_here")
    # console.print("\nOr add it to your .env file.")
    raise RuntimeError("No API key configured. Please set OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, SILLICONFLOW_API_KEY, MOONSHOT_API_KEY, ZHIPU_API_KEY, or DASHSCOPE_API_KEY")


class AgentModelNotConfiguredError(RuntimeError):
    """Agent 尚未配置模型提供商。"""
    pass


def create_model_for_agent(agent_name: str) -> BaseChatModel:
    """根据 Agent 的配置创建对应的模型实例。
    
    Args:
        agent_name: Agent 的名称
        
    Returns:
        ChatModel 实例
        
    Raises:
        RuntimeError: 如果 Agent 配置不存在或 API key 未配置
    """
    import json
    from pathlib import Path
    from deepagents_webapi.session.env_manager import EnvManager
    
    # 获取 agents 目录（CamphorOS 统一放在 data/runtime/agents 下）
    agents_dir = camphor_settings.RUNTIME_AGENTS_DIR
    agent_config_path = agents_dir / agent_name / 'model_config.json'
    
    if not agent_config_path.exists():
        raise RuntimeError(f"Agent '{agent_name}' 的配置文件不存在：{agent_config_path}")
    
    # 读取配置
    env_manager = EnvManager()
    with open(agent_config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    provider = config.get('provider')
    model_name = config.get('model_name')
    base_url = config.get('base_url')

    if not provider:
        raise AgentModelNotConfiguredError(
            f"❌ Agent '{agent_name}' 尚未配置模型提供商。"
            f"请前往配置 API Key 后，重新设定 Agent的模型选项。"
        )

    api_key = env_manager.get_api_key(provider)
    provider_defaults = env_manager.get_provider_defaults(provider)
    model_name = model_name or provider_defaults.get("model_name")
    base_url = base_url or provider_defaults.get("base_url")

    if not api_key:
        raise RuntimeError(f"Provider '{provider}' 的 API key 未配置或值为空")
    
    # 根据 provider 创建对应的模型
    if provider == 'openai':
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model_name or "gpt-5-mini",
            api_key=api_key,
            base_url=base_url or None,
        )
    
    if provider == 'siliconflow':
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model_name=model_name or "deepseek-ai/DeepSeek-V3.2",
            api_key=api_key,
            base_url=base_url or "https://api.siliconflow.cn/v1",
        )
    
    if provider == 'kimi':
        from deepagents_webapi.model.kimi_reasoning_fix import ChatKimiWithReasoning
        return ChatKimiWithReasoning(
            model_name=model_name or "kimi-k2.5",
            api_key=api_key,
            base_url=base_url or "https://api.moonshot.cn/v1",
        )
    
    if provider == 'zhipu':
        from deepagents_webapi.model.zhipu_reasoning_fix import ChatZhipuWithReasoning
        return ChatZhipuWithReasoning(
            model_name=model_name or "glm-5",
            api_key=api_key,
            base_url=base_url or "https://open.bigmodel.cn/api/paas/v4",
        )
    
    if provider == 'qwen':
        from deepagents_webapi.model.qwen_reasoning_fix import ChatQwenWithReasoning
        return ChatQwenWithReasoning(
            model_name=model_name or "qwen3.5-plus",
            api_key=api_key,
            base_url=base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
    
    if provider == 'minimax':
        from deepagents_webapi.model.minimax_model import ChatMinimax
        return ChatMinimax(
            model_name=model_name or "MiniMax-M2.5",
            api_key=api_key,
            base_url=base_url or "https://api.minimax.chat/v1",
        )
    
    if provider == 'deepseek':
        from deepagents_webapi.model.deepseek_reasoning_fix import ChatDeepSeekWithFullReasoning
        return ChatDeepSeekWithFullReasoning(
            model_name=model_name or "deepseek-reasoner",
            api_key=api_key,
            base_url=base_url or "https://api.deepseek.com/v1",
        )
    
    if provider == 'anthropic':
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model_name=model_name or "claude-sonnet-4-5-20250929",
            api_key=api_key,
            max_tokens=20_000,
        )
    
    if provider == 'google':
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model_name or "gemini-3-pro-preview",
            api_key=api_key,
            temperature=0,
            max_tokens=None,
        )
    
    raise RuntimeError(f"不支持的模型提供商：{provider}")
