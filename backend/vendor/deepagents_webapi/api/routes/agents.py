import json
import re
import shutil

from fastapi import APIRouter, HTTPException

from deepagents_webapi.api.models import (
    AgentListItem, AgentListResponse,
    CreateAgentRequest, CreateAgentResponse,
    DeleteAgentRequest, DeleteAgentResponse,
    ResetAgentRequest, ResetAgentResponse,
    UpdateAgentModelRequest, UpdateAgentModelResponse,
)
from deepagents_webapi.config import settings, get_default_identity, get_default_agent_rules, get_default_tools_description

from app.core.database import SessionLocal
from app.repositories.workspace import get_workspace
from app.repositories.workspace_agent import get_workspace_agent

router = APIRouter()


# 运行时 agent 名称 → 业务昵称解析
_SUPERAGENT_RE = re.compile(r"^workspace-(\d+)-superagent$")
_WORKAGENT_RE = re.compile(r"^workagent-(\d+)$")


@router.get("/api/runtime/agents", response_model=AgentListResponse)
async def list_agents():
    """获取所有 Agent 的列表信息。"""
    from deepagents_webapi.session.env_manager import EnvManager
    
    agents_dir = settings.user_deepagents_dir
    
    if not agents_dir.exists():
        return {"agents": []}
    
    # legacy fallback: env_var_name → provider 映射（兼容旧 model_config.json）
    from deepagents_webapi.session.env_manager import PROVIDER_METADATA
    key_to_provider = {
        meta["env_var_name"]: meta["provider"]
        for meta in PROVIDER_METADATA
    }
    
    agents = []
    db = SessionLocal()
    try:
        for agent_path in sorted(agents_dir.iterdir()):
            if not agent_path.is_dir():
                continue
            
            if not (agent_path / "agent.md").exists():
                continue
            
            if not settings._is_valid_agent_name(agent_path.name):
                continue
            
            name = agent_path.name
            display_name = None
            workspace_id = None
            
            # 解析 superagent：workspace-{ws_id}-superagent → workspace-{ws_name}-superagent-{nick}
            m = _SUPERAGENT_RE.match(name)
            if m:
                ws_id = int(m.group(1))
                workspace_id = ws_id
                ws = get_workspace(db, ws_id)
                if ws:
                    nick = ws.super_agent_nick_name or "项目经理"
                    display_name = f"workspace-{ws.name}-superagent-{nick}"
            else:
                # 解析 workagent：workagent-{id} → workspace-{ws_name}-workagent-{nick}
                m = _WORKAGENT_RE.match(name)
                if m:
                    agent_id = int(m.group(1))
                    wa = get_workspace_agent(db, agent_id)
                    if wa:
                        workspace_id = wa.work_space_id
                        ws = get_workspace(db, wa.work_space_id)
                        ws_name = ws.name if ws else "未知空间"
                        nick = wa.name or "执行专员"
                        display_name = f"workspace-{ws_name}-workagent-{nick}"
            
            model_provider = None
            model_name = None
            config_path = agent_path / "model_config.json"
            base_url = None
            if config_path.exists():
                try:
                    config_data = json.loads(config_path.read_text(encoding='utf-8'))
                    model_provider = config_data.get("provider")
                    model_name = config_data.get("model_name")
                    base_url = config_data.get("base_url")
                    legacy_model_key_name = config_data.get("model_key_name")
                    if not model_provider and legacy_model_key_name and legacy_model_key_name in key_to_provider:
                        model_provider = key_to_provider[legacy_model_key_name]
                except Exception:
                    pass
            
            has_skills = (agent_path / "skills").exists()
            
            agents.append(AgentListItem(
                name=name,
                display_name=display_name,
                workspace_id=workspace_id,
                path=str(agent_path),
                has_skills=has_skills,
                model_provider=model_provider,
                model_name=model_name,
                base_url=base_url,
            ))
    finally:
        db.close()
    
    return {"agents": agents}


@router.get("/api/runtime/agents/dir")
async def get_agents_dir():
    """获取 agents 根目录路径"""
    agents_dir = settings.user_deepagents_dir
    agents_dir.mkdir(parents=True, exist_ok=True)
    return {"path": str(agents_dir)}


@router.post("/api/runtime/agents/create", response_model=CreateAgentResponse)
async def create_agent(request: CreateAgentRequest):
    """创建新 Agent。
    
    完全模仿 create_agent_with_config() 的逻辑，使用默认模板创建 agent 文件。
    
    Args:
        request: 创建请求，包含 agent_name, provider, model_name, base_url, overwrite(可选)
    
    Returns:
        创建结果
    
    Raises:
        HTTPException: 如果 agent 名称无效、provider 不存在或 key 值为空
    """
    from deepagents_webapi.session.env_manager import EnvManager, PROVIDER_METADATA
    
    # 验证 agent 名称
    if not settings._is_valid_agent_name(request.agent_name):
        raise HTTPException(
            status_code=400,
            detail=f"无效的 agent 名称：{request.agent_name}。名称只能包含字母、数字、连字符、下划线和空格。"
        )
    
    env_manager = EnvManager()
    
    model_providers = {
        meta["provider"]: meta for meta in PROVIDER_METADATA
        if meta.get("category") == "model"
    }
    provider = request.provider.strip()
    if provider not in model_providers:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 provider：{request.provider}。请从已支持的模型提供商中选择。"
        )

    api_key = env_manager.get_api_key(provider)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider}' 未配置 API key 或值为空。请先在设置中配置该 Provider。"
        )
    
    agents_dir = settings.user_deepagents_dir
    agent_dir = agents_dir / request.agent_name
    
    # 检查是否已存在
    if agent_dir.exists():
        if request.overwrite:
            # 删除已有 agent
            shutil.rmtree(agent_dir)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Agent '{request.agent_name}' 已存在。如需覆盖请设置 overwrite=true"
            )
    
    try:
        # 完全模仿 create_agent_with_config() 的逻辑
        # 步骤 1: 创建 agent 目录
        agent_dir.mkdir(parents=True, exist_ok=True)
        
        # 步骤 2: 创建 3 个核心文件（使用默认模板）
        # 2.1 identity.md
        identity_path = agent_dir / "identity.md"
        if not identity_path.exists():
            identity_path.write_text(get_default_identity(), encoding='utf-8')
        
        # 2.2 agent.md
        agent_rules_path = agent_dir / "agent.md"
        if not agent_rules_path.exists():
            agent_rules_path.write_text(get_default_agent_rules(), encoding='utf-8')
        
        # 2.3 tools.md
        tools_path = agent_dir / "tools.md"
        if not tools_path.exists():
            tools_path.write_text(get_default_tools_description(), encoding='utf-8')
        
        # 步骤 3: 创建 skills 目录
        skills_dir = agent_dir / "skills"
        skills_dir.mkdir(parents=True, exist_ok=True)
        
        # 步骤 4: 保存 model 配置到 agent 目录
        config_path = agent_dir / "model_config.json"
        provider_defaults = model_providers[provider]
        final_model_name = request.model_name.strip() or provider_defaults.get("model_name")
        final_base_url = request.base_url.strip() or provider_defaults.get("base_url")

        config_data = {
            "provider": provider,
            "model_name": final_model_name,
            "base_url": final_base_url,
        }
        config_path.write_text(json.dumps(config_data, indent=2, ensure_ascii=False), encoding='utf-8')
        
        return CreateAgentResponse(
            success=True,
            message=f"Agent '{request.agent_name}' 创建成功（{provider} / {final_model_name}）",
            agent_name=request.agent_name,
            agent_dir=str(agent_dir)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        # 发生错误时清理目录
        if agent_dir.exists():
            shutil.rmtree(agent_dir)
        raise HTTPException(
            status_code=500,
            detail=f"创建 agent 失败：{str(e)}"
        )


@router.delete("/api/runtime/agents/delete", response_model=DeleteAgentResponse)
async def delete_agent(request: DeleteAgentRequest):
    """删除 Agent。
    
    Args:
        request: 删除请求，包含 agent_name
    
    Returns:
        删除结果
    
    Raises:
        HTTPException: 如果 agent 不存在
    """
    agents_dir = settings.user_deepagents_dir
    agent_dir = agents_dir / request.agent_name
    
    if not agent_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{request.agent_name}' 不存在"
        )
    
    try:
        shutil.rmtree(agent_dir)
        return DeleteAgentResponse(
            success=True,
            message=f"Agent '{request.agent_name}' 已删除",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"删除 agent 失败：{str(e)}"
        )


@router.post("/api/runtime/agents/reset", response_model=ResetAgentResponse)
async def reset_agent_endpoint(request: ResetAgentRequest):
    """重置 Agent 到默认配置。
    
    删除 agent.md 并重新使用默认模板创建。
    
    Args:
        request: 重置请求，包含 agent_name
    
    Returns:
        重置结果
    
    Raises:
        HTTPException: 如果 agent 不存在
    """
    agents_dir = settings.user_deepagents_dir
    agent_dir = agents_dir / request.agent_name
    
    if not agent_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{request.agent_name}' 不存在"
        )
    
    try:
        # 重新创建 agent.md（使用默认模板）
        agent_rules_path = agent_dir / "agent.md"
        agent_rules_path.write_text(get_default_agent_rules(), encoding='utf-8')
        
        return ResetAgentResponse(
            success=True,
            message=f"Agent '{request.agent_name}' 已重置为默认配置",
            agent_name=request.agent_name
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"重置 agent 失败：{str(e)}"
        )


@router.post("/api/runtime/agents/update-model", response_model=UpdateAgentModelResponse)
async def update_agent_model(request: UpdateAgentModelRequest):
    """修改已有 Agent 的模型配置。
    
    Args:
        request: 修改请求，包含 agent_name, provider, model_name, base_url
        
    Returns:
        修改后的配置信息
        
    Raises:
        HTTPException: 如果 agent 不存在、provider 无效或 key 未配置
    """
    from deepagents_webapi.session.env_manager import EnvManager, PROVIDER_METADATA
    from deepagents_webapi.config import reload_settings
    
    # 验证 agent 存在
    agents_dir = settings.user_deepagents_dir
    agent_dir = agents_dir / request.agent_name
    if not agent_dir.exists():
        raise HTTPException(status_code=404, detail=f"Agent '{request.agent_name}' 不存在")
    
    # 验证 provider 合法
    model_providers = {
        meta["provider"]: meta for meta in PROVIDER_METADATA
        if meta.get("category") == "model"
    }
    provider = request.provider.strip()
    if provider not in model_providers:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 provider：{request.provider}"
        )
    
    # 验证该 provider 的 key 已配置
    env_manager = EnvManager()
    api_key = env_manager.get_api_key(provider)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider}' 未配置 API key。请先在 Settings 中配置。"
        )
    
    # 读取并更新 model_config.json（防御性覆盖：只改指定字段，保留其他）
    config_path = agent_dir / "model_config.json"
    if config_path.exists():
        try:
            cfg = json.loads(config_path.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            cfg = {}  # 文件损坏时回退到空对象
    else:
        cfg = {}
    provider_defaults = model_providers[provider]
    final_model_name = request.model_name.strip() or provider_defaults.get("model_name", "")
    # 如果用户没填 base_url，优先保留原文件中的值，其次用 provider 默认值
    existing_base_url = cfg.get("base_url") if cfg else None
    final_base_url = request.base_url.strip() or existing_base_url or provider_defaults.get("base_url", "")
    
    cfg.update({
        "provider": provider,
        "model_name": final_model_name,
        "base_url": final_base_url,
    })
    config_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding='utf-8')
    
    reload_settings()
    
    return UpdateAgentModelResponse(
        success=True,
        message=f"Agent '{request.agent_name}' 模型已更新为 {provider}",
        agent_name=request.agent_name,
        provider=provider,
        model_name=final_model_name,
        base_url=final_base_url,
    )
