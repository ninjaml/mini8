"""Skills module for deepagents CLI.

Public API:
- SkillsMiddleware: Middleware for integrating skills into agent execution

All other components are internal implementation details.
"""

from deepagents_webapi.skills.middleware import SkillsMiddleware

__all__ = [
    "SkillsMiddleware",
]
