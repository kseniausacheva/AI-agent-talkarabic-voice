"""Partner onboarding records; separate from newsletter subscribers and school leads."""
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Partner(Base):
    __tablename__ = "partners"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    reference: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    legal_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    contact_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    country: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(Text, nullable=False, default="")
    partner_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new", index=True)
    profile_json: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_to: Mapped[str] = mapped_column(Text, nullable=False, default="")
    next_follow_up: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    privacy_notice_version: Mapped[str] = mapped_column(String(80), nullable=False)
    privacy_acknowledged_at: Mapped[str] = mapped_column(String(40), nullable=False)
    marketing_opt_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    marketing_consent_version: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    marketing_opt_in_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)
    is_demo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PartnerEvent(Base):
    __tablename__ = "partner_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    partner_id: Mapped[str] = mapped_column(String(40), ForeignKey("partners.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_manager_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("managers.id"), nullable=True)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    data_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")


class PartnerAgreementVersion(Base):
    """Append-only text snapshots. No API edits or publishes an existing row."""

    __tablename__ = "partner_agreement_versions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    version: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("managers.id"), nullable=False)
    published_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)


class PartnerAcceptance(Base):
    """Evidence storage for the future verified assent workflow; currently disabled."""

    __tablename__ = "partner_acceptances"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    partner_id: Mapped[str] = mapped_column(String(40), ForeignKey("partners.id"), nullable=False, index=True)
    agreement_id: Mapped[str] = mapped_column(String(40), ForeignKey("partner_agreement_versions.id"), nullable=False)
    signer_name: Mapped[str] = mapped_column(Text, nullable=False)
    signer_role: Mapped[str] = mapped_column(Text, nullable=False)
    legal_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified_at: Mapped[str] = mapped_column(String(40), nullable=False)
    accepted_at: Mapped[str] = mapped_column(String(40), nullable=False)
    agreement_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    agreement_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_json: Mapped[str] = mapped_column(Text, nullable=False)
