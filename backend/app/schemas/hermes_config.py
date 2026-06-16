from pydantic import BaseModel


class HermesConfigCreate(BaseModel):
    key: str
    value: str
    description: str | None = None


class HermesConfigUpdate(BaseModel):
    value: str
    description: str | None = None


class HermesConfigRead(BaseModel):
    id: int
    key: str
    value: str
    description: str | None = None

    class Config:
        from_attributes = True
