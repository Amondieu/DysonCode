from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from .memory_models import (
    ConflictRequest,
    ConflictResponse,
    RecallAsOfRequest,
    RecallRequest,
    RecallResponse,
    RememberRequest,
    RememberResponse,
)
from .repository import MemoryRepository
from .service import MemoryService

router = APIRouter(prefix="/memory", tags=["memory"])


async def get_db_session() -> AsyncSession:
    raise NotImplementedError("Wire this to KORE's existing AsyncSession dependency")


def require_api_key(x_api_key: Annotated[str | None, Header()] = None) -> str:
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing x-api-key",
        )
    return x_api_key


async def get_memory_service(
    session: AsyncSession = Depends(get_db_session),
) -> MemoryService:
    repository = MemoryRepository(session)
    return MemoryService(repository)


@router.post("/remember", response_model=RememberResponse)
async def remember_memory(
    payload: RememberRequest,
    _: str = Depends(require_api_key),
    service: MemoryService = Depends(get_memory_service),
) -> RememberResponse:
    try:
        return await service.remember(payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post("/recall", response_model=RecallResponse)
async def recall_memory(
    payload: RecallRequest,
    _: str = Depends(require_api_key),
    service: MemoryService = Depends(get_memory_service),
) -> RecallResponse:
    return await service.recall(payload)


@router.post("/recall/as-of", response_model=RecallResponse)
async def recall_memory_as_of(
    payload: RecallAsOfRequest,
    _: str = Depends(require_api_key),
    service: MemoryService = Depends(get_memory_service),
) -> RecallResponse:
    if payload.as_of > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="as_of cannot be in the future",
        )
    return await service.recall_as_of(payload)


@router.post("/conflicts", response_model=ConflictResponse)
async def scan_memory_conflicts(
    payload: ConflictRequest,
    _: str = Depends(require_api_key),
    service: MemoryService = Depends(get_memory_service),
) -> ConflictResponse:
    return await service.conflicts(payload)
