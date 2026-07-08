from fastapi import APIRouter, HTTPException

from deepagents_webapi.api.models import (
    SetApiKeyRequest, ApiKeyItem, ApiKeyListResponse,
    DeleteApiKeyRequest,
    ActivateApiKeyRequest,
)

router = APIRouter()


@router.get("/api/runtime/env/keys", response_model=ApiKeyListResponse)
async def list_api_keys():
    """列出所有 API keys（不返回值）"""
    from deepagents_webapi.session.env_manager import EnvManager
    try:
        env_manager = EnvManager()
        keys = env_manager.list_api_keys()
        return ApiKeyListResponse(keys=[ApiKeyItem(**k) for k in keys])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/runtime/env/keys")
async def set_api_key(request: SetApiKeyRequest):
    """设置/更新 API key"""
    from deepagents_webapi.session.env_manager import EnvManager
    from deepagents_webapi.config import reload_settings
    try:
        env_manager = EnvManager()
        provider = request.provider.strip()
        if not provider:
            raise HTTPException(status_code=400, detail="缺少 provider")

        env_manager.set_api_key(provider, request.key_value, request.description, request.base_url.strip())
        reload_settings()
        return {"success": True, "message": f"{provider} 已保存"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/runtime/env/keys/delete")
async def delete_api_key(request: DeleteApiKeyRequest):
    """删除 API key"""
    from deepagents_webapi.session.env_manager import EnvManager
    from deepagents_webapi.config import reload_settings
    try:
        env_manager = EnvManager()
        deleted = env_manager.delete_api_key(request.provider)
        if deleted:
            reload_settings()
            return {"success": True, "message": f"{request.provider} 已删除"}
        else:
            raise HTTPException(status_code=404, detail=f"{request.provider} 不存在")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/runtime/env/keys/activate")
async def activate_api_key(request: ActivateApiKeyRequest):
    """将某个模型 provider 设为默认模型来源。"""
    from deepagents_webapi.session.env_manager import EnvManager
    from deepagents_webapi.config import reload_settings
    try:
        env_manager = EnvManager()
        provider = request.provider.strip()
        if not provider:
            raise HTTPException(status_code=400, detail="缺少 provider")
        activated = env_manager.activate_model_provider(provider)
        if not activated:
            raise HTTPException(status_code=400, detail="provider 不存在、不是模型 provider，或尚未配置 key")
        reload_settings()
        return {"success": True, "message": f"{provider} 已设为默认模型来源"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

