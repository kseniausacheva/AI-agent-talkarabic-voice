"""La Royal Event partner onboarding and CRM. No newsletter or email side effects."""
import csv
import hashlib
import io
import json
import re
import time
import uuid
from collections import OrderedDict, deque
from datetime import date, datetime, timezone
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import Manager, get_session
from app.models.partner import (
    Partner,
    PartnerAcceptance,
    PartnerAgreementVersion,
    PartnerEvent,
)
from app.services.auth import require_admin

router = APIRouter(prefix="/api/partners", tags=["partners"])
Status = Literal["new", "reviewing", "approved", "declined", "paused"]
STATUSES = ("new", "reviewing", "approved", "declined", "paused")
# UTF-8 and JSON unicode escaping can require several bytes per permitted
# character. Keep a bounded envelope that fits all declared profile fields.
BODY_LIMIT = 131_072
DEMO_ID = "demo-royal-partner-review"
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_requests: OrderedDict[str, deque] = OrderedDict()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.title() for part in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True)


class PartnerApplication(CamelModel):
    company_name: str = Field(min_length=1, max_length=200)
    legal_name: str = Field(default="", max_length=250)
    registration_number: str = Field(default="", max_length=100)
    country: str = Field(min_length=1, max_length=100)
    city: str = Field(default="", max_length=120)
    website: str = Field(default="", max_length=500)
    contact_name: str = Field(min_length=1, max_length=150)
    role: str = Field(default="", max_length=120)
    email: str = Field(min_length=3, max_length=255)
    phone: str = Field(default="", max_length=80)
    partner_type: str = Field(min_length=1, max_length=80)
    services: list[str] = Field(min_length=1, max_length=20)
    destinations: list[str] = Field(default_factory=list, max_length=30)
    languages: list[str] = Field(default_factory=list, max_length=20)
    years_experience: Optional[int] = Field(default=None, ge=0, le=150)
    capacity: str = Field(default="", max_length=1500)
    portfolio: str = Field(default="", max_length=3000)
    licenses: str = Field(default="", max_length=1500)
    insurance: str = Field(default="", max_length=1500)
    notes: str = Field(default="", max_length=3000)
    privacy_acknowledged: bool = Field(strict=True)
    marketing_opt_in: bool = Field(default=False, strict=True)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if not _EMAIL.fullmatch(value):
            raise ValueError("Enter a valid email address.")
        return value.lower()

    @field_validator("website")
    @classmethod
    def validate_website(cls, value: str) -> str:
        if value:
            parsed = urlparse(value)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise ValueError("Website must start with https:// or http://.")
        return value

    @field_validator("services", "destinations", "languages")
    @classmethod
    def validate_options(cls, values: list[str]) -> list[str]:
        cleaned = []
        for value in values:
            value = value.strip()
            if not value or len(value) > 100:
                raise ValueError("Each selected item must have 1–100 characters.")
            if value not in cleaned:
                cleaned.append(value)
        return cleaned

    @field_validator("privacy_acknowledged")
    @classmethod
    def require_privacy_acknowledgement(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Please acknowledge the partner privacy notice.")
        return value


class PartnerUpdate(CamelModel):
    status: Optional[Status] = None
    assigned_to: Optional[str] = Field(default=None, max_length=150)
    next_follow_up: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=4000)


class AgreementDraft(CamelModel):
    version: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=250)
    content_text: str = Field(min_length=50, max_length=100_000)


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Pragma"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"


def _check_origin(request: Request) -> None:
    """Browser writes must come from the explicitly configured portal origins.

    This is CSRF protection, not authentication or an anti-bot claim. All private
    writes additionally require the existing admin bearer authentication.
    """
    origin = request.headers.get("origin", "").rstrip("/")
    allowed = {value.rstrip("/") for value in get_settings().cors_origins}
    allowed.add(str(request.base_url).rstrip("/"))
    if not origin or origin not in allowed:
        raise HTTPException(status_code=403, detail="This form origin is not allowed.")


def _rate_limit(request: Request) -> None:
    """Bounded per-process intake throttle; deployment edge limits can supplement it."""
    # Forwarded headers are deliberately not trusted as an identity source.
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    attempts = _requests.pop(key, deque())
    while attempts and attempts[0] < now - 600:
        attempts.popleft()
    _requests[key] = attempts
    if len(_requests) > 5000:
        _requests.popitem(last=False)
    if len(attempts) >= 10:
        raise HTTPException(status_code=429, detail="Too many applications. Please try again later.", headers={"Retry-After": "600"})
    attempts.append(now)


async def _read_json(request: Request, limit: int = BODY_LIMIT) -> dict:
    if request.headers.get("content-type", "").split(";", 1)[0].strip() != "application/json":
        raise HTTPException(status_code=415, detail="Use application/json.")
    size = 0
    chunks = []
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise HTTPException(status_code=413, detail="The application is too large.")
        chunks.append(chunk)
    try:
        data = json.loads(b"".join(chunks))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON.")
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Expected a JSON object.")
    return data


def _validated(model, data: dict):
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        # Omit raw input values from error responses (especially contact data).
        errors = [{"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]} for item in exc.errors()]
        raise HTTPException(status_code=422, detail=errors)


def _partner_out(row: Partner, accepted: bool = False) -> dict:
    return {
        "id": row.id, "reference": row.reference,
        "companyName": row.company_name, "legalName": row.legal_name,
        "contactName": row.contact_name, "email": row.email,
        "country": row.country, "city": row.city, "partnerType": row.partner_type,
        "status": row.status, "assignedTo": row.assigned_to,
        "nextFollowUp": row.next_follow_up,
        "createdAt": row.created_at, "updatedAt": row.updated_at,
        "marketingOptIn": bool(row.marketing_opt_in), "isDemo": bool(row.is_demo),
        "agreementStatus": "accepted" if accepted else "not_accepted",
    }


def _event(row: Partner, kind: str, actor: str, data: dict, manager_id: Optional[int] = None) -> PartnerEvent:
    return PartnerEvent(partner_id=row.id, kind=kind, actor=actor,
                        actor_manager_id=manager_id, created_at=_now(),
                        data_json=json.dumps(data, ensure_ascii=False))


def _conditions(search: str, status: Optional[str]) -> list:
    conditions = []
    if search.strip():
        pattern = "%" + search.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        columns = (Partner.company_name, Partner.legal_name, Partner.contact_name, Partner.email, Partner.reference)
        conditions.append(or_(*(func.lower(col).like(pattern, escape="\\") for col in columns)))
    if status:
        conditions.append(Partner.status == status)
    return conditions


async def _detail(row: Partner, db: AsyncSession) -> dict:
    acceptances = (await db.execute(select(PartnerAcceptance).where(PartnerAcceptance.partner_id == row.id).order_by(PartnerAcceptance.accepted_at.desc()))).scalars().all()
    events = (await db.execute(select(PartnerEvent).where(PartnerEvent.partner_id == row.id).order_by(PartnerEvent.id.desc()).limit(500))).scalars().all()
    return {
        **_partner_out(row, bool(acceptances)),
        "profile": json.loads(row.profile_json),
        "privacyNoticeVersion": row.privacy_notice_version,
        "privacyAcknowledgedAt": row.privacy_acknowledged_at,
        "marketingConsentVersion": row.marketing_consent_version,
        "marketingOptInAt": row.marketing_opt_in_at,
        "events": [{"id": e.id, "kind": e.kind, "actor": e.actor,
                    "createdAt": e.created_at, "data": json.loads(e.data_json)} for e in events],
        "acceptances": [{"id": a.id, "agreementId": a.agreement_id,
                         "signerName": a.signer_name, "signerRole": a.signer_role,
                         "email": a.email, "emailVerifiedAt": a.email_verified_at,
                         "acceptedAt": a.accepted_at, "agreementSha256": a.agreement_sha256}
                        for a in acceptances],
    }


@router.get("/config")
async def partner_config(response: Response):
    _no_store(response)
    settings = get_settings()
    return {
        "intakeEnabled": settings.partner_intake_enabled,
        # Email proof delivery/verification is not implemented in this release.
        "acceptanceEnabled": False,
        "brevoConfigured": bool(settings.brevo_api_key),
        "agreementVersion": None,
        "privacyNoticeVersion": settings.partner_privacy_notice_version,
        "marketingConsentVersion": settings.partner_marketing_consent_version,
    }


@router.post("", status_code=201)
async def apply_partner(request: Request, response: Response, db: AsyncSession = Depends(get_session)):
    _no_store(response)
    settings = get_settings()
    if not settings.partner_intake_enabled:
        raise HTTPException(status_code=503, detail="Partner applications are not open yet.")
    _check_origin(request)
    _rate_limit(request)
    payload = _validated(PartnerApplication, await _read_json(request))
    now = _now()
    row_id = uuid.uuid4().hex
    fingerprint = hashlib.sha256((payload.email + "\0" + payload.company_name.casefold()).encode()).hexdigest()
    row = Partner(
        id=row_id, reference="RE-P-" + row_id[:12].upper(), fingerprint=fingerprint,
        company_name=payload.company_name, legal_name=payload.legal_name,
        contact_name=payload.contact_name, email=payload.email,
        country=payload.country, city=payload.city, partner_type=payload.partner_type,
        status="new", profile_json=payload.model_dump_json(by_alias=True),
        assigned_to="", next_follow_up=None,
        privacy_notice_version=settings.partner_privacy_notice_version,
        privacy_acknowledged_at=now, marketing_opt_in=int(payload.marketing_opt_in),
        marketing_consent_version=settings.partner_marketing_consent_version if payload.marketing_opt_in else None,
        marketing_opt_in_at=now if payload.marketing_opt_in else None,
        created_at=now, updated_at=now, is_demo=0,
    )
    db.add(row)
    db.add(_event(row, "application_received", "Partner application", {"privacyNoticeVersion": row.privacy_notice_version, "marketingOptIn": payload.marketing_opt_in}))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An application for these details is already on file. Please contact the team to update it.")
    return {"id": row.id, "reference": row.reference}


@router.get("")
async def list_partners(
    response: Response,
    search: str = Query(default="", max_length=150),
    status: Optional[Status] = Query(default=None),
    page: int = Query(default=1, ge=1, le=10_000),
    per_page: int = Query(default=30, ge=1, le=100),
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    _no_store(response)
    conditions = _conditions(search, status)
    total = await db.scalar(select(func.count()).select_from(Partner).where(*conditions)) or 0
    rows = (await db.execute(select(Partner).where(*conditions).order_by(Partner.created_at.desc(), Partner.id).offset((page - 1) * per_page).limit(per_page))).scalars().all()
    ids = [row.id for row in rows]
    accepted = set((await db.execute(select(PartnerAcceptance.partner_id).where(PartnerAcceptance.partner_id.in_(ids)))).scalars().all()) if ids else set()
    count_rows = (await db.execute(select(Partner.status, func.count()).group_by(Partner.status))).all()
    counts = dict.fromkeys(STATUSES, 0)
    counts.update({key: value for key, value in count_rows if key in counts})
    return {"items": [_partner_out(row, row.id in accepted) for row in rows],
            "total": total, "page": page, "per_page": per_page,
            "pages": (total + per_page - 1) // per_page, "counts": counts}


def _csv_safe(value) -> str:
    value = str(value or "")
    # Spreadsheet formula recognition also ignores leading whitespace/control.
    return "'" + value if value.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")) else value


@router.get("/export.csv")
async def export_partners(
    search: str = Query(default="", max_length=150),
    status: Optional[Status] = Query(default=None),
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    rows = (await db.execute(select(Partner).where(*_conditions(search, status)).order_by(Partner.created_at.desc()).limit(10_001))).scalars().all()
    if len(rows) > 10_000:
        raise HTTPException(status_code=413, detail="Export is limited to 10,000 records. Please request a scoped export.")
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["Reference", "Company", "Legal name", "Contact", "Email", "Country", "City", "Partner type", "Status", "Assigned to", "Next follow-up", "Marketing opt-in", "Created at", "Demo"])
    for row in rows:
        writer.writerow([_csv_safe(value) for value in (row.reference, row.company_name, row.legal_name, row.contact_name, row.email, row.country, row.city, row.partner_type, row.status, row.assigned_to, row.next_follow_up, "yes" if row.marketing_opt_in else "no", row.created_at, "yes" if row.is_demo else "no")])
    return Response("\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="la-royal-event-partners.csv"', "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff"})


@router.post("/demo")
async def create_demo(request: Request, response: Response, manager: Manager = Depends(require_admin), db: AsyncSession = Depends(get_session)):
    _no_store(response)
    _check_origin(request)
    existing = await db.get(Partner, DEMO_ID)
    if existing:
        return {"id": existing.id, "reference": existing.reference, "created": False}
    now = _now()
    payload = PartnerApplication(companyName="[DEMO] Example Partner — delete after review", legalName="Example Partner (test only)", country="Egypt", city="Cairo", contactName="Test Contact", email="partner@example.test", partnerType="Production supplier", services=["Event production"], destinations=["Cairo"], languages=["English"], yearsExperience=5, notes="TEST DATA. Created only to verify CRM storage and status changes. No email is sent.", privacyAcknowledged=True, marketingOptIn=False)
    row = Partner(id=DEMO_ID, reference="RE-P-DEMO-REVIEW", fingerprint="demo-royal-partner-review", company_name=payload.company_name, legal_name=payload.legal_name, contact_name=payload.contact_name, email=payload.email, country=payload.country, city=payload.city, partner_type=payload.partner_type, status="new", profile_json=payload.model_dump_json(by_alias=True), assigned_to="", next_follow_up=None, privacy_notice_version="DEMO-NO-LEGAL-EFFECT", privacy_acknowledged_at=now, marketing_opt_in=0, created_at=now, updated_at=now, is_demo=1)
    db.add(row)
    db.add(_event(row, "demo_created", manager.display_name, {"note": "Clearly marked test fixture; no application or legal assent."}, manager.id))
    await db.commit()
    return {"id": row.id, "reference": row.reference, "created": True}


@router.delete("/demo")
async def delete_demo(request: Request, response: Response, manager: Manager = Depends(require_admin), db: AsyncSession = Depends(get_session)):
    _no_store(response)
    _check_origin(request)
    row = await db.get(Partner, DEMO_ID)
    if not row or not row.is_demo:
        return {"deleted": 0}
    await db.execute(delete(PartnerEvent).where(PartnerEvent.partner_id == DEMO_ID))
    await db.execute(delete(PartnerAcceptance).where(PartnerAcceptance.partner_id == DEMO_ID))
    await db.delete(row)
    await db.commit()
    return {"deleted": 1}


@router.get("/agreements")
async def list_agreement_drafts(response: Response, manager: Manager = Depends(require_admin), db: AsyncSession = Depends(get_session)):
    _no_store(response)
    rows = (await db.execute(select(PartnerAgreementVersion).order_by(PartnerAgreementVersion.created_at.desc()).limit(100))).scalars().all()
    return {"items": [{"id": row.id, "version": row.version, "title": row.title, "sha256": row.sha256, "state": row.state, "createdAt": row.created_at, "publishedAt": row.published_at} for row in rows]}


@router.post("/agreements", status_code=201)
async def save_agreement_draft(request: Request, response: Response, manager: Manager = Depends(require_admin), db: AsyncSession = Depends(get_session)):
    _no_store(response)
    _check_origin(request)
    payload = _validated(AgreementDraft, await _read_json(request, 120_000))
    row = PartnerAgreementVersion(id=uuid.uuid4().hex, version=payload.version, title=payload.title, content_text=payload.content_text, sha256=hashlib.sha256(payload.content_text.encode()).hexdigest(), state="draft", created_at=_now(), created_by=manager.id)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="This immutable agreement version already exists. Save a new version number.")
    return {"id": row.id, "version": row.version, "sha256": row.sha256, "state": row.state}


@router.post("/acceptances")
async def accept_agreement():
    # Keep the endpoint fail-closed even if an environment flag is accidentally
    # switched on. This release does not send/verify email proof or publish terms.
    raise HTTPException(status_code=503, detail="Agreement acceptance is not open. A final agreement and verified signer workflow are required.")


@router.get("/{partner_id}")
async def get_partner(partner_id: str, response: Response, manager: Manager = Depends(require_admin), db: AsyncSession = Depends(get_session)):
    _no_store(response)
    row = await db.get(Partner, partner_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Partner not found.")
    return await _detail(row, db)


@router.patch("/{partner_id}")
async def update_partner(partner_id: str, request: Request, response: Response, manager: Manager = Depends(require_admin), db: AsyncSession = Depends(get_session)):
    _no_store(response)
    _check_origin(request)
    payload = _validated(PartnerUpdate, await _read_json(request))
    row = await db.get(Partner, partner_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Partner not found.")
    changes = {}
    for key, attribute in (("status", "status"), ("assigned_to", "assigned_to"), ("next_follow_up", "next_follow_up")):
        if key not in payload.model_fields_set:
            continue
        value = getattr(payload, key)
        if key == "next_follow_up":
            value = value.isoformat() if value else None
        elif value is None:
            raise HTTPException(status_code=422, detail=f"{_camel(key)} cannot be null.")
        old = getattr(row, attribute)
        if old != value:
            changes[_camel(key)] = {"from": old, "to": value}
            setattr(row, attribute, value)
    note = payload.note or ""
    if not changes and not note:
        raise HTTPException(status_code=422, detail="Provide a status change, assignment, follow-up date or note.")
    row.updated_at = _now()
    data = {"changes": changes} if changes else {}
    if note:
        data["note"] = note
    db.add(_event(row, "updated" if changes else "note", manager.display_name, data, manager.id))
    await db.commit()
    return await _detail(row, db)
