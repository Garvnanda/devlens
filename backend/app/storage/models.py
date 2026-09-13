"""
Phase 9/14: SQLAlchemy models for the persistent relational store.

User is Phase 9 (Identity Layer). ContributionMemory and StreakBadge are
Phase 14 (Memory & Motivation) but defined here alongside User to avoid a
second schema migration pass later.
"""

from datetime import datetime, date

from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship

from app.storage.db import Base


class User(Base):
    __tablename__ = "users"

    github_id = Column(Integer, primary_key=True)
    login = Column(String, unique=True, nullable=False, index=True)
    avatar_url = Column(String, default="")

    # Persona (Phase 8 shape, kept field-compatible with app.services.persona.UserProfile)
    level = Column(String, default="junior")
    language = Column(String, default="English")
    goal = Column(String, default="contributing")

    # Encrypted GitHub OAuth access token (Fernet-encrypted, never stored raw)
    encrypted_github_token = Column(Text, nullable=True)

    # Phase 9 Skill Fingerprint — stored as JSON text, nullable until job completes
    skill_fingerprint_json = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    contributions = relationship("ContributionMemory", back_populates="user")
    streak = relationship("StreakBadge", back_populates="user", uselist=False)


class ContributionMemory(Base):
    __tablename__ = "contribution_memory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.github_id"), nullable=False, index=True)
    repo_owner = Column(String, nullable=False)
    repo_name = Column(String, nullable=False)
    issue_number = Column(Integer, nullable=True)
    status = Column(String, default="explored")  # explored | attempted | completed
    pr_url = Column(String, nullable=True)
    title = Column(String, nullable=True)          # issue / PR title, for dashboard + portfolio
    mission_mode = Column(String, nullable=True)   # Architect mode when an issue was attempted
    verified_at = Column(DateTime, nullable=True)  # set only once a merged PR by this user is confirmed
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="contributions")


class StreakBadge(Base):
    __tablename__ = "streak_badges"

    user_id = Column(Integer, ForeignKey("users.github_id"), primary_key=True)
    current_streak_days = Column(Integer, default=0)  # counts consecutive active WEEKS (name kept for schema stability)
    last_active_date = Column(Date, default=date.today)
    longest_streak = Column(Integer, default=0)
    badges_json = Column(Text, default="[]")  # JSON list of badge ids earned

    user = relationship("User", back_populates="streak")


class FingerprintSnapshot(Base):
    """Phase 14: one row per Skill Fingerprint computation, so drift over time is visible."""
    __tablename__ = "fingerprint_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.github_id"), nullable=False, index=True)
    language_distribution_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class IssueClassification(Base):
    """Phase 10: cached issue label so repeat global searches never re-classify the same issue.

    Categories are a shared contract with Haragam's Phase 15 auto-triage — do not rename.
    """
    __tablename__ = "issue_classifications"

    issue_id = Column(Integer, primary_key=True)  # GitHub's global issue id
    label = Column(String, nullable=False)        # Bug | Feature | Docs | Security | Good-First-Issue
    created_at = Column(DateTime, default=datetime.utcnow)
