from pydantic import BaseModel


class KBConfigCreate(BaseModel):
    key: str
    value: str
    description: str | None = None


class KBConfigUpdate(BaseModel):
    value: str
    description: str | None = None


class KBConfigRead(BaseModel):
    id: int
    key: str
    value: str
    description: str | None = None

    class Config:
        from_attributes = True
