from __future__ import annotations

from typing import Any, Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class StatusEnvelope(BaseModel):
    status: str = "ok"
    message: Optional[str] = None


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    has_more: bool


class HealthResponse(BaseModel):
    status: str
    rpc: bool
    rpc_height: Optional[int] = None
    electrumx: bool
    db: bool
    indexer_height: Optional[int] = None
    version: str
