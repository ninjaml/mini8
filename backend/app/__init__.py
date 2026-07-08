def create_app(*args, **kwargs):
    """Lazily import the FastAPI factory to avoid package import cycles."""
    from .main import create_app as _create_app

    return _create_app(*args, **kwargs)


__all__ = ["create_app"]
