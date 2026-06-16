import time

import requests as req
from fastapi import APIRouter, HTTPException

from deepagents_webapi.api.models import SpeechRecognizeRequest

router = APIRouter()

_baidu_token_cache = {"token": None, "expires_at": 0}


@router.get("/api/speech/token")
async def get_speech_token():
    """获取百度语音识别 access_token（通过后端代理，密钥不暴露给前端）"""
    if _baidu_token_cache["token"] and time.time() < _baidu_token_cache["expires_at"]:
        return {"access_token": _baidu_token_cache["token"]}

    from deepagents_webapi.session.env_manager import EnvManager
    env = EnvManager()
    api_key = env.get_api_key("baidu_api")
    secret_key = env.get_api_key("baidu_secret")

    if not api_key or not secret_key:
        raise HTTPException(status_code=400, detail="百度语音 API Key 未配置，请在设置中添加")

    try:
        resp = req.get("https://aip.baidubce.com/oauth/2.0/token", params={
            "grant_type": "client_credentials",
            "client_id": api_key,
            "client_secret": secret_key,
        }, timeout=10)
        data = resp.json()
        if "access_token" not in data:
            raise HTTPException(status_code=500, detail=f"获取 token 失败: {data.get('error_description', '未知错误')}")

        _baidu_token_cache["token"] = data["access_token"]
        _baidu_token_cache["expires_at"] = time.time() + 29 * 24 * 3600

        return {"access_token": data["access_token"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取百度 token 失败: {str(e)}")


@router.post("/api/speech/recognize")
async def speech_recognize(request: SpeechRecognizeRequest):
    """转发语音识别请求到百度 API"""
    try:
        resp = req.post("https://vop.baidu.com/server_api", json={
            "format": request.format,
            "rate": request.rate,
            "channel": request.channel,
            "cuid": "mini8_web",
            "token": request.token,
            "speech": request.speech,
            "len": request.len,
        }, headers={"Content-Type": "application/json"}, timeout=30)

        result = resp.json()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"语音识别请求失败: {str(e)}")
