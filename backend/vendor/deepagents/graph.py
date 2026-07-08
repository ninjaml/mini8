"""Deepagents come with planning, filesystem, and subagents."""

from collections.abc import Callable, Sequence
from typing import Any

from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware, InterruptOnConfig, TodoListMiddleware
from langchain.agents.middleware.summarization import SummarizationMiddleware
from langchain.agents.middleware.types import AgentMiddleware
from langchain.agents.structured_output import ResponseFormat
from langchain_anthropic import ChatAnthropic
from langchain_anthropic.middleware import AnthropicPromptCachingMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
from langgraph.cache.base import BaseCache
from langgraph.graph.state import CompiledStateGraph
from langgraph.store.base import BaseStore
from langgraph.types import Checkpointer

from deepagents.backends.protocol import BackendFactory, BackendProtocol
from deepagents.middleware.filesystem_factory import create_filesystem_middleware
from deepagents.middleware.deepseek_summarization import DeepSeekSummarizationMiddleware
from deepagents.middleware.patch_tool_calls import PatchToolCallsMiddleware
from deepagents.middleware.subagents import CompiledSubAgent, SubAgent, SubAgentMiddleware
import os
from pathlib import Path
from deepagents.middleware.shell_factory import create_shell_middleware
from deepagents.middleware.browser import BrowserMiddleware


BASE_AGENT_PROMPT = "In order to complete the objective that the user asks of you, you have access to a number of standard tools."


def get_default_model() -> ChatAnthropic:
    """Get the default model for deep agents.

    Returns:
        ChatAnthropic instance configured with Claude Sonnet 4.
    """
    return ChatAnthropic(
        model_name="claude-sonnet-4-5-20250929",
        max_tokens=20000,
    )


def create_deep_agent(
    model: str | BaseChatModel | None = None,
    tools: Sequence[BaseTool | Callable | dict[str, Any]] | None = None,
    *,
    system_prompt: str | None = None,
    middleware: Sequence[AgentMiddleware] = (),
    subagents: list[SubAgent | CompiledSubAgent] | None = None,
    # 父会话级的子 Agent 委派模式：null / executor / collaborator。
    # 它不是某个 child definition 自己的配置，而是整场 parent graph 的委派协议。
    subagent_mode: str | None = None,
    response_format: ResponseFormat | None = None,
    context_schema: type[Any] | None = None,
    checkpointer: Checkpointer | None = None,
    store: BaseStore | None = None,
    backend: BackendProtocol | BackendFactory | None = None,
    interrupt_on: dict[str, bool | InterruptOnConfig] | None = None,
    debug: bool = False,
    name: str | None = None,
    cache: BaseCache | None = None,
) -> CompiledStateGraph:
    """Create a deep agent.

    This agent will by default have access to a tool to write todos (write_todos),
    seven file and execution tools: ls, read_file, write_file, edit_file, glob, grep, execute,
    and a tool to call subagents.

    The execute tool allows running shell commands if the backend implements SandboxBackendProtocol.
    For non-sandbox backends, the execute tool will return an error message.

    Args:
        model: The model to use. Defaults to Claude Sonnet 4.
        tools: The tools the agent should have access to.
        system_prompt: The additional instructions the agent should have. Will go in
            the system prompt.
        middleware: Additional middleware to apply after standard middleware.
        subagents: The subagents to use. Each subagent should be a dictionary with the
            following keys:
                - `name`
                - `description` (used by the main agent to decide whether to call the
                  sub agent)
                - `prompt` (used as the system prompt in the subagent)
                - (optional) `tools`
                - (optional) `model` (either a LanguageModelLike instance or dict
                  settings)
                - (optional) `middleware` (list of AgentMiddleware)
        response_format: A structured output response format to use for the agent.
        context_schema: The schema of the deep agent.
        checkpointer: Optional checkpointer for persisting agent state between runs.
        store: Optional store for persistent storage (required if backend uses StoreBackend).
        backend: Optional backend for file storage and execution. Pass either a Backend instance
            or a callable factory like `lambda rt: StateBackend(rt)`. For execution support,
            use a backend that implements SandboxBackendProtocol.
        interrupt_on: Optional Dict[str, bool | InterruptOnConfig] mapping tool names to
            interrupt configs.
        debug: Whether to enable debug mode. Passed through to create_agent.
        name: The name of the agent. Passed through to create_agent.
        cache: The cache to use for the agent. Passed through to create_agent.

    Returns:
        A configured deep agent.
    """
    if model is None:
        model = get_default_model()

    # # 已经改动成了自定义的summary
    # if (
    #     model.profile is not None
    #     and isinstance(model.profile, dict)
    #     and "max_input_tokens" in model.profile
    #     and isinstance(model.profile["max_input_tokens"], int)
    # ):
    #     trigger = ("fraction", 0.80)
    #     keep = ("fraction", 0.10)
    # else:
    #     trigger = ("tokens", 128000) # deepseek 最多 128K
    #     keep = ("messages", 6)

    # 判断是否是 Kimi 模型，调整 trigger_tokens
    from deepagents_webapi.model.kimi_reasoning_fix import ChatKimiWithReasoning
    from deepagents_webapi.model.zhipu_reasoning_fix import ChatZhipuWithReasoning
    from deepagents_webapi.model.qwen_reasoning_fix import ChatQwenWithReasoning
    from deepagents_webapi.model.minimax_model import ChatMinimax
    _is_kimi = isinstance(model, ChatKimiWithReasoning)
    _is_qwen = isinstance(model, ChatQwenWithReasoning)
    _is_zhipu = isinstance(model, ChatZhipuWithReasoning)
    _is_minimax = isinstance(model, ChatMinimax)
    # 各模型上下文窗口及触发摘要阈值（基于实际有效使用量，约 50-60% 理论值）：
    # Kimi k2.5: 256K → 128K | GLM-5: 200K → 100K | Qwen3.5-plus: 1M → 150K | DeepSeek: 128K → 64K
    if _is_kimi:
        _trigger_tokens = 128000
    elif _is_zhipu:
        _trigger_tokens = 100000
    elif _is_qwen:
        _trigger_tokens = 150000
    elif _is_minimax:
        _trigger_tokens = 120000
    else:
        _trigger_tokens = 256000

    # 判断模型是否支持多模态（vision）
    # Anthropic Claude、OpenAI GPT-4o、Kimi、Qwen 支持；DeepSeek、智谱 GLM-5、minimax 不支持
    # 注意：MiniMax 虽然不支持 vision，但支持 Interleaved Thinking（使用 reasoning_details 字段）
    from langchain_deepseek import ChatDeepSeek
    from deepagents_webapi.model.minimax_model import ChatMinimax
    _vision = not isinstance(model, (ChatDeepSeek, ChatZhipuWithReasoning, ChatMinimax))

    deepagent_middleware = [   
        DeepSeekSummarizationMiddleware(
            model=model,
            trigger_tokens=_trigger_tokens,
            keep_messages=10,
            max_summary_tokens=4000,
        ),
        # #已经换成了新的总结器
        # SummarizationMiddleware(
        #             model=model,
        #             trigger=trigger,
        #             keep=keep,
        #             trim_tokens_to_summarize=None,
        #         ),
        TodoListMiddleware(),
        create_filesystem_middleware(backend=backend),
        BrowserMiddleware(vision=_vision),
        SubAgentMiddleware(
            default_model=model,
            default_tools=tools,
            subagents=subagents,
            # vendor 层从这里开始感知双模式语义，后面 task prompt / task tool 的
            # 说明文案与 busy_rejected 行为都会跟着这个 mode 切换。
            subagent_mode=subagent_mode,
            default_middleware=[
                DeepSeekSummarizationMiddleware(
                    model=model,
                    trigger_tokens=_trigger_tokens,
                    keep_messages=10,
                    max_summary_tokens=4000,
                ),
                # #已经换成了新的总结器
                # SummarizationMiddleware(
                #             model=model,
                #             trigger=trigger,
                #             keep=keep,
                #             trim_tokens_to_summarize=None,
                #         ),
                TodoListMiddleware(),
                create_filesystem_middleware(backend=backend),
                BrowserMiddleware(vision=_vision),
                # 总是添加ShellMiddleware（需要导入）
                create_shell_middleware(workspace_root=str(Path.cwd()), env=os.environ), 
                AnthropicPromptCachingMiddleware(unsupported_model_behavior="ignore"),
                PatchToolCallsMiddleware(),
            ],
            default_interrupt_on=interrupt_on,
        ),
        
        AnthropicPromptCachingMiddleware(unsupported_model_behavior="ignore"),
        PatchToolCallsMiddleware(),
    ]
    if middleware:
        deepagent_middleware.extend(middleware)
    if interrupt_on is not None:
        deepagent_middleware.append(HumanInTheLoopMiddleware(interrupt_on=interrupt_on))

    return create_agent(
        model,
        system_prompt=system_prompt + "\n\n" + BASE_AGENT_PROMPT if system_prompt else BASE_AGENT_PROMPT,
        tools=tools,
        middleware=deepagent_middleware,
        response_format=response_format,
        context_schema=context_schema,
        checkpointer=checkpointer,
        store=store,
        debug=debug,
        name=name,
        cache=cache,
    ).with_config({"recursion_limit": 1000})
