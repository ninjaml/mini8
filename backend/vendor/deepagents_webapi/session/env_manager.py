"""Environment variable manager - stores API keys in SQLite database with encryption."""

import sqlite3
import os
import base64
from pathlib import Path
from datetime import datetime
from app.core.sqlite_connection import connect_sqlite


# Provider 元数据：集中维护 provider → 环境变量名 / 模型默认参数 的映射
PROVIDER_METADATA = [
    {"provider": "openai",       "env_var_name": "OPENAI_API_KEY",        "description": "OpenAI API 密钥",         "category": "model", "model_name": "gpt-5.5",                "base_url": "https://api.openai.com/v1"},
    {"provider": "anthropic",    "env_var_name": "ANTHROPIC_API_KEY",     "description": "Anthropic API 密钥",      "category": "model", "model_name": "claude-4.7", "base_url": "https://api.anthropic.com"},
    {"provider": "google",       "env_var_name": "GOOGLE_API_KEY",        "description": "Google API 密钥",         "category": "model", "model_name": "gemini-3.1",       "base_url": "https://generativelanguage.googleapis.com"},
    {"provider": "deepseek",     "env_var_name": "DEEPSEEK_API_KEY",      "description": "DeepSeek API 密钥",       "category": "model", "model_name": "deepseek-v4-flash",          "base_url": "https://api.deepseek.com/v1"},
    {"provider": "siliconflow",  "env_var_name": "SILLICONFLOW_API_KEY",  "description": "SiliconFlow API 密钥",    "category": "model", "model_name": "deepseek-ai/Deepseek-v4-flash",  "base_url": "https://api.siliconflow.cn/v1"},
    {"provider": "kimi",         "env_var_name": "MOONSHOT_API_KEY",      "description": "Kimi 多模态模型",         "category": "model", "model_name": "kimi-k2.6",                  "base_url": "https://api.moonshot.cn/v1"},
    {"provider": "zhipu",        "env_var_name": "ZHIPU_API_KEY",         "description": "智谱 GLM-5 模型",         "category": "model", "model_name": "glm-5.1",                      "base_url": "https://open.bigmodel.cn/api/paas/v4"},
    {"provider": "qwen",         "env_var_name": "DASHSCOPE_API_KEY",     "description": "通义千问 Qwen 模型",      "category": "model", "model_name": "qwen3.6-plus",               "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    {"provider": "minimax",      "env_var_name": "MINIMAX_API_KEY",       "description": "MiniMax M2.5 模型",       "category": "model", "model_name": "MiniMax-M2.6",               "base_url": "https://api.minimax.chat/v1"},
    {"provider": "tavily",       "env_var_name": "TAVILY_API_KEY",        "description": "Tavily 搜索 API 密钥",    "category": "search"},
    {"provider": "baidu_api",    "env_var_name": "BAIDU_SPEECH_API_KEY",  "description": "百度语音识别 API Key",    "category": "speechToText"},
    {"provider": "baidu_secret", "env_var_name": "BAIDU_SPEECH_SECRET_KEY","description": "百度语音识别 Secret Key", "category": "speechToText"},
]


class EnvManager:
    """管理 API keys 的数据库存储和加密。"""

    def __init__(self):
        from app.core.config import settings as camphor_settings
        self.secret_dir = camphor_settings.RUNTIME_ENV_DIR
        self.db_path = camphor_settings.APP_DB_PATH
        self.secret_key_path = self.secret_dir / ".secret_key"
        self._ensure_db()

    def _ensure_db(self):
        """确保数据库和表存在。测试阶段：不兼容旧表，直接重建。"""
        self.secret_dir.mkdir(parents=True, exist_ok=True)
        conn = connect_sqlite(self.db_path)
        try:
            # 旧表存在则删除（测试阶段不迁移）
            columns = [row[1] for row in conn.execute("PRAGMA table_info(api_keys)").fetchall()]
            if columns and "key_name" in columns:
                conn.execute("DROP TABLE api_keys")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS api_keys (
                    provider TEXT PRIMARY KEY,
                    key_value TEXT,
                    description TEXT DEFAULT '',
                    category TEXT DEFAULT 'model',
                    model_name TEXT,
                    base_url TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
        finally:
            conn.close()

    def _get_secret_key(self) -> bytes:
        """获取或生成加密密钥。"""
        if self.secret_key_path.exists():
            return self.secret_key_path.read_bytes()
        # 生成新密钥
        key = os.urandom(32)
        self.secret_key_path.write_bytes(key)
        return key

    def _encrypt(self, value: str) -> str:
        """简单的 XOR 加密 + base64 编码。"""
        key = self._get_secret_key()
        value_bytes = value.encode("utf-8")
        # XOR 加密
        encrypted = bytes(b ^ key[i % len(key)] for i, b in enumerate(value_bytes))
        return base64.b64encode(encrypted).decode("ascii")

    def _decrypt(self, encrypted: str) -> str:
        """解密。"""
        key = self._get_secret_key()
        encrypted_bytes = base64.b64decode(encrypted)
        # XOR 解密（与加密相同）
        decrypted = bytes(b ^ key[i % len(key)] for i, b in enumerate(encrypted_bytes))
        return decrypted.decode("utf-8")

    def get_api_key(self, provider: str) -> str | None:
        """获取指定 provider 的 API key（解密后返回）。
        
        不检查激活状态，只要有值就返回。
        """
        conn = connect_sqlite(self.db_path)
        try:
            row = conn.execute(
                "SELECT key_value FROM api_keys WHERE provider = ?",
                (provider,)
            ).fetchone()
            if row and row[0]:
                return self._decrypt(row[0])
            return None
        finally:
            conn.close()

    def get_active_model_provider(self) -> str | None:
        """返回当前默认模型 provider。"""
        conn = connect_sqlite(self.db_path)
        try:
            row = conn.execute(
                """
                SELECT provider
                FROM api_keys
                WHERE category = 'model'
                  AND is_active = 1
                  AND key_value IS NOT NULL
                  AND key_value != ''
                ORDER BY updated_at DESC
                LIMIT 1
                """
            ).fetchone()
            return row[0] if row else None
        finally:
            conn.close()

    def get_default_model_config(self) -> dict:
        """返回当前默认模型配置。

        仅当存在已配置 key 且 is_active=1 的 model provider 时返回完整配置。
        """
        provider = self.get_active_model_provider()
        if not provider:
            return {
                "provider": None,
                "model_name": None,
                "base_url": None,
            }

        record = self.get_provider_record(provider)
        if record is None or not record.get("has_value"):
            return {
                "provider": None,
                "model_name": None,
                "base_url": None,
            }

        return {
            "provider": provider,
            "model_name": record.get("model_name"),
            "base_url": record.get("base_url"),
        }

    def get_provider_defaults(self, provider: str) -> dict:
        """获取 provider 的预定义默认信息。"""
        for meta in PROVIDER_METADATA:
            if meta["provider"] == provider:
                return meta
        return {}

    def get_provider_record(self, provider: str) -> dict | None:
        """获取指定 provider 的数据库记录元信息。"""
        conn = connect_sqlite(self.db_path)
        try:
            row = conn.execute(
                """
                SELECT provider, description, category, model_name, base_url, key_value
                FROM api_keys
                WHERE provider = ?
                """,
                (provider,),
            ).fetchone()
            if not row:
                return None
            return {
                "provider": row[0],
                "description": row[1],
                "category": row[2] or "model",
                "model_name": row[3],
                "base_url": row[4],
                "has_value": row[5] is not None and row[5] != "",
            }
        finally:
            conn.close()

    def _get_category(self, provider: str) -> str:
        """获取 provider 的 category。"""
        for meta in PROVIDER_METADATA:
            if meta["provider"] == provider:
                return meta["category"]
        return "model"

    def _get_predefined_info(self, provider: str) -> dict:
        """获取预定义 provider 的完整信息（model_name, base_url 等）。"""
        for meta in PROVIDER_METADATA:
            if meta["provider"] == provider:
                return meta
        return {}

    def set_api_key(self, provider: str, key_value: str, description: str = "", base_url: str = ""):
        """设置/更新 API key（加密存储）。"""
        encrypted = self._encrypt(key_value) if key_value else None
        now = datetime.now().isoformat()
        category = self._get_category(provider)
        predefined = self._get_predefined_info(provider)
        model_name = predefined.get("model_name")
        final_base_url = base_url or predefined.get("base_url")
        conn = connect_sqlite(self.db_path)
        try:
            existing = conn.execute(
                "SELECT provider, is_active FROM api_keys WHERE provider = ?", (provider,)
            ).fetchone()
            if existing:
                is_active = int(existing[1]) if len(existing) > 1 and existing[1] is not None else 0
                conn.execute(
                    "UPDATE api_keys SET key_value = ?, description = ?, category = ?, model_name = ?, base_url = ?, is_active = ?, updated_at = ? WHERE provider = ?",
                    (encrypted, description, category, model_name, final_base_url, is_active, now, provider)
                )
            else:
                default_active = 0
                if category == "model" and encrypted:
                    has_active_model = conn.execute(
                        """
                        SELECT 1
                        FROM api_keys
                        WHERE category = 'model'
                          AND is_active = 1
                          AND key_value IS NOT NULL
                          AND key_value != ''
                        LIMIT 1
                        """
                    ).fetchone()
                    default_active = 0 if has_active_model else 1
                conn.execute(
                    "INSERT INTO api_keys (provider, key_value, description, category, model_name, base_url, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (provider, encrypted, description, category, model_name, final_base_url, default_active, now, now)
                )
            conn.commit()
        finally:
            conn.close()

    def activate_model_provider(self, provider: str) -> bool:
        """将指定模型 provider 设为默认模型来源。"""
        conn = connect_sqlite(self.db_path)
        try:
            row = conn.execute(
                "SELECT category, key_value FROM api_keys WHERE provider = ?",
                (provider,),
            ).fetchone()
            if not row:
                return False
            category, key_value = row
            if (category or "model") != "model":
                return False
            if key_value is None or key_value == "":
                return False

            now = datetime.now().isoformat()
            conn.execute(
                "UPDATE api_keys SET is_active = 0, updated_at = ? WHERE category = 'model'",
                (now,),
            )
            conn.execute(
                "UPDATE api_keys SET is_active = 1, updated_at = ? WHERE provider = ?",
                (now, provider),
            )
            conn.commit()
            return True
        finally:
            conn.close()

    def delete_api_key(self, provider: str) -> bool:
        """删除 API key。"""
        conn = connect_sqlite(self.db_path)
        try:
            cursor = conn.execute("DELETE FROM api_keys WHERE provider = ?", (provider,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def list_api_keys(self) -> list[dict]:
        """列出所有 API keys（不返回值，只返回元数据）。"""
        conn = connect_sqlite(self.db_path)
        try:
            rows = conn.execute(
                "SELECT provider, description, is_active, key_value, category, model_name, base_url FROM api_keys"
            ).fetchall()
            db_keys = {}
            for row in rows:
                preview = ""
                if row[3]:
                    try:
                        val = self._decrypt(row[3])
                        if len(val) > 10:
                            preview = val[:5] + "***" + val[-5:]
                        else:
                            preview = val[:2] + "***"
                    except Exception:
                        preview = "***"
                db_keys[row[0]] = {
                    "provider": row[0],
                    "description": row[1],
                    "is_active": bool(row[2]),
                    "has_value": row[3] is not None and row[3] != "",
                    "category": row[4] or "model",
                    "model_name": row[5],
                    "base_url": row[6],
                    "key_preview": preview,
                }
            # 合并预定义的 providers
            result = []
            for meta in PROVIDER_METADATA:
                if meta["provider"] in db_keys:
                    result.append(db_keys[meta["provider"]])
                else:
                    result.append({
                        "provider": meta["provider"],
                        "description": meta["description"],
                        "category": meta["category"],
                        "model_name": meta.get("model_name"),
                        "base_url": meta.get("base_url"),
                        "is_active": False,
                        "has_value": False,
                        "key_preview": "",
                    })
            # 添加数据库中有但预定义中没有的 providers
            predefined_names = {meta["provider"] for meta in PROVIDER_METADATA}
            for name, info in db_keys.items():
                if name not in predefined_names:
                    result.append(info)
            return result
        finally:
            conn.close()

    def get_all_configured_keys(self) -> dict[str, str]:
        """获取所有已配置的 API keys（解密后返回，用于内部加载）。
        
        返回 {provider: key_value} 映射。
        """
        conn = connect_sqlite(self.db_path)
        try:
            rows = conn.execute(
                "SELECT provider, key_value FROM api_keys WHERE key_value IS NOT NULL AND key_value != ''"
            ).fetchall()
            result = {}
            for row in rows:
                try:
                    result[row[0]] = self._decrypt(row[1])
                except Exception:
                    pass  # 解密失败跳过
            return result
        finally:
            conn.close()

