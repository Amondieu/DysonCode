# database.py — PostgreSQL models + connection
# Uses SQLAlchemy async + asyncpg (Railway Postgres compatible)

import os
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped, relationship
from sqlalchemy import String, Integer, BigInteger, DateTime, JSON, ForeignKey, Boolean, Text
from sqlalchemy import select, update
import secrets

DATABASE_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(DATABASE_URL, pool_size=10, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class Agent(Base):
    __tablename__ = "agents"
    id:            Mapped[int]      = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agent_id:      Mapped[str]      = mapped_column(String(64), unique=True, index=True)
    api_key:       Mapped[str]      = mapped_column(String(128), unique=True, index=True)
    email:         Mapped[str]      = mapped_column(String(256), default="")
    credits:       Mapped[int]      = mapped_column(BigInteger, default=100)
    tier:          Mapped[str]      = mapped_column(String(32), default="free")
    stripe_customer_id: Mapped[str] = mapped_column(String(64), default="")
    is_active:     Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    subscriptions: Mapped[list]     = relationship("Subscription", back_populates="agent", lazy="selectin")
    usage_logs:    Mapped[list]     = relationship("UsageLog", back_populates="agent", lazy="noload")

class Subscription(Base):
    __tablename__ = "subscriptions"
    id:             Mapped[int]  = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agent_id:       Mapped[str]  = mapped_column(String(64), ForeignKey("agents.agent_id"), index=True)
    feature:        Mapped[str]  = mapped_column(String(64))   # "drift" | "session_memory" | "dataset_export"
    stripe_sub_id:  Mapped[str]  = mapped_column(String(64), default="")
    plan:           Mapped[str]  = mapped_column(String(32), default="")
    active:         Mapped[bool] = mapped_column(Boolean, default=True)
    created_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    agent:          Mapped["Agent"] = relationship("Agent", back_populates="subscriptions")

class UsageLog(Base):
    __tablename__ = "usage_logs"
    id:          Mapped[int]  = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agent_id:    Mapped[str]  = mapped_column(String(64), ForeignKey("agents.agent_id"), index=True)
    service:     Mapped[str]  = mapped_column(String(64))
    credits_used:Mapped[int]  = mapped_column(Integer, default=0)
    credits_after:Mapped[int] = mapped_column(Integer, default=0)
    meta:        Mapped[dict] = mapped_column(JSON, default=dict)
    ts:          Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    agent:       Mapped["Agent"] = relationship("Agent", back_populates="usage_logs")

class CreditTransaction(Base):
    __tablename__ = "credit_transactions"
    id:              Mapped[int]  = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agent_id:        Mapped[str]  = mapped_column(String(64), index=True)
    stripe_session:  Mapped[str]  = mapped_column(String(128), unique=True)
    credits_added:   Mapped[int]  = mapped_column(Integer)
    pack:            Mapped[str]  = mapped_column(String(32))
    amount_eur:      Mapped[int]  = mapped_column(Integer)   # in cents
    processed:       Mapped[bool] = mapped_column(Boolean, default=False)
    ts:              Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with SessionLocal() as session:
        yield session
