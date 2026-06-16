from pydantic import BaseModel


class OpenClawConfigCreate(BaseModel):
    key: str
    value: str
    description: str | None = None


class OpenClawConfigUpdate(BaseModel):
    value: str
    description: str | None = None


class OpenClawConfigRead(BaseModel):
    id: int
    key: str
    value: str
    description: str | None = None

    class Config:
        from_attributes = True
