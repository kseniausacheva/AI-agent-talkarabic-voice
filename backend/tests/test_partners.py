"""Run: python -m unittest discover -s tests -p test_partners.py

Uses isolated temporary SQLite and FastAPI router only: never sends email,
touches production data, starts Whisper or runs the mailing scheduler.
"""
import os
import unittest

os.environ.setdefault("OPENROUTER_API_KEY", "test-not-a-live-key")
os.environ.setdefault("AUTH_SECRET", "partner-tests-only-not-a-production-secret")

import httpx
from fastapi import FastAPI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import Base, Manager, Subscriber, get_session
from app.models.partner import Partner, PartnerAcceptance, PartnerEvent
from app.routers.partners import BODY_LIMIT, _csv_safe, _requests, router
from app.services.auth import create_token


ORIGIN = "https://partners.example.test"
APPLICATION = {
    "companyName": "Supplier Example",
    "legalName": "Supplier Example LLC",
    "country": "Egypt",
    "city": "Cairo",
    "contactName": "Example Contact",
    "email": "example@partner.test",
    "partnerType": "Production supplier",
    "services": ["Event production"],
    "privacyAcknowledged": True,
    "marketingOptIn": False,
}


class PartnerApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
        self.factory = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async def session_override():
            async with self.factory() as session:
                yield session

        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_session] = session_override
        self.settings = get_settings()
        self.old_intake = self.settings.partner_intake_enabled
        self.old_origins = self.settings.allowed_origins
        self.settings.partner_intake_enabled = True
        self.settings.allowed_origins = ORIGIN
        _requests.clear()
        async with self.factory() as session:
            self.admin = Manager(username="test_admin", password_hash="unused", display_name="Test Admin", role="admin", created_at="2026-11-20T00:00:00+00:00")
            self.manager = Manager(username="test_manager", password_hash="unused", display_name="Test Manager", role="manager", created_at="2026-11-20T00:00:00+00:00")
            session.add_all([self.admin, self.manager])
            await session.commit()
        self.admin_headers = {"Authorization": "Bearer " + create_token(self.admin), "Origin": ORIGIN}
        self.manager_headers = {"Authorization": "Bearer " + create_token(self.manager), "Origin": ORIGIN}
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://api.example.test")

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()
        self.settings.partner_intake_enabled = self.old_intake
        self.settings.allowed_origins = self.old_origins

    async def apply(self, extra=None):
        return await self.client.post("/api/partners", headers={"Origin": ORIGIN}, json={**APPLICATION, **(extra or {})})

    async def test_private_records_and_export_require_real_admin(self):
        for path in ("/api/partners", "/api/partners/export.csv", "/api/partners/missing", "/api/partners/agreements"):
            self.assertEqual((await self.client.get(path)).status_code, 401)
            self.assertEqual((await self.client.get(path, headers=self.manager_headers)).status_code, 403)
        result = await self.client.get("/api/partners", headers=self.admin_headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["total"], 0)
        self.assertIn("no-store", result.headers["cache-control"])

    async def test_intake_gate_origin_validation_size_and_separate_consent(self):
        self.settings.partner_intake_enabled = False
        self.assertEqual((await self.apply()).status_code, 503)
        self.settings.partner_intake_enabled = True
        self.assertEqual((await self.client.post("/api/partners", json=APPLICATION)).status_code, 403)
        self.assertEqual((await self.client.post("/api/partners", headers={"Origin": "https://untrusted.example"}, json=APPLICATION)).status_code, 403)
        self.assertEqual((await self.apply({"privacyAcknowledged": False})).status_code, 422)
        self.assertEqual((await self.apply({"marketingOptIn": "true"})).status_code, 422)
        self.assertEqual((await self.apply({"acceptedAgreement": True})).status_code, 422)
        self.assertEqual((await self.client.post("/api/partners", headers={"Origin": ORIGIN, "Content-Type": "application/json"}, content=b" " * (BODY_LIMIT + 1))).status_code, 413)
        result = await self.apply()
        self.assertEqual(result.status_code, 201, result.text)
        async with self.factory() as session:
            row = await session.get(Partner, result.json()["id"])
            self.assertEqual(row.marketing_opt_in, 0)
            self.assertIsNone(row.marketing_opt_in_at)
            self.assertEqual(await session.scalar(select(func.count()).select_from(Subscriber)), 0)
            self.assertEqual(await session.scalar(select(func.count()).select_from(PartnerAcceptance)), 0)

    async def test_valid_multilingual_profile_fits_the_bounded_body(self):
        result = await self.apply({
            "companyName": "شركة تنظيم الفعاليات",
            "contactName": "Контакт партнёра",
            "notes": "م" * 3000,
            "capacity": "Я" * 1500,
            "portfolio": "م" * 3000,
            "licenses": "Я" * 1500,
            "insurance": "م" * 1500,
        })
        self.assertEqual(result.status_code, 201, result.text)

    async def test_status_followup_and_notes_have_server_audit(self):
        created = await self.apply({"marketingOptIn": True})
        partner_id = created.json()["id"]
        path = "/api/partners/" + partner_id
        denied = await self.client.patch(path, headers=self.manager_headers, json={"status": "approved"})
        self.assertEqual(denied.status_code, 403)
        bad_origin = await self.client.patch(path, headers={"Authorization": self.admin_headers["Authorization"]}, json={"status": "approved"})
        self.assertEqual(bad_origin.status_code, 403)
        changed = await self.client.patch(path, headers=self.admin_headers, json={"status": "reviewing", "assignedTo": "Ksenia", "nextFollowUp": "2026-11-25", "note": "Verify insurance evidence."})
        self.assertEqual(changed.status_code, 200, changed.text)
        data = changed.json()
        self.assertEqual(data["status"], "reviewing")
        self.assertEqual(data["nextFollowUp"], "2026-11-25")
        self.assertEqual(data["events"][0]["actor"], "Test Admin")
        self.assertEqual(data["events"][0]["data"]["changes"]["status"], {"from": "new", "to": "reviewing"})
        self.assertEqual(data["events"][0]["data"]["note"], "Verify insurance evidence.")
        self.assertTrue(data["marketingOptInAt"])
        self.assertEqual(data["agreementStatus"], "not_accepted")
        self.assertEqual((await self.client.patch(path, headers=self.admin_headers, json={"status": "arbitrary"})).status_code, 422)
        self.assertEqual((await self.client.patch(path, headers=self.admin_headers, json={"nextFollowUp": "not-a-date"})).status_code, 422)

    async def test_duplicate_does_not_overwrite_or_subscribe(self):
        first = await self.apply()
        second = await self.apply({"marketingOptIn": True, "notes": "Overwrite attempt"})
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        async with self.factory() as session:
            self.assertEqual(await session.scalar(select(func.count()).select_from(Partner)), 1)
            row = await session.get(Partner, first.json()["id"])
            self.assertEqual(row.marketing_opt_in, 0)
            self.assertEqual(await session.scalar(select(func.count()).select_from(Subscriber)), 0)

    async def test_export_formula_escape_and_demo_cleanup_scoped(self):
        created = await self.apply({"companyName": "=HYPERLINK(\"https://example.test\")"})
        exported = await self.client.get("/api/partners/export.csv", headers=self.admin_headers)
        self.assertEqual(exported.status_code, 200)
        self.assertIn("'=HYPERLINK", exported.text)
        demo = await self.client.post("/api/partners/demo", headers=self.admin_headers)
        self.assertTrue(demo.json()["created"])
        self.assertFalse((await self.client.post("/api/partners/demo", headers=self.admin_headers)).json()["created"])
        deleted = await self.client.delete("/api/partners/demo", headers=self.admin_headers)
        self.assertEqual(deleted.json()["deleted"], 1)
        async with self.factory() as session:
            self.assertIsNotNone(await session.get(Partner, created.json()["id"]))
            self.assertEqual(await session.scalar(select(func.count()).select_from(Partner)), 1)

    async def test_agreements_append_only_and_acceptance_fail_closed(self):
        payload = {"version": "draft-test-1", "title": "Test agreement", "contentText": "Draft terms for isolated automated testing only. " * 3}
        saved = await self.client.post("/api/partners/agreements", headers=self.admin_headers, json=payload)
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertEqual(saved.json()["state"], "draft")
        self.assertEqual((await self.client.post("/api/partners/agreements", headers=self.admin_headers, json={**payload, "contentText": "Different text " * 10})).status_code, 409)
        self.assertEqual((await self.client.post("/api/partners/acceptances", json={"agreed": True})).status_code, 503)
        self.assertFalse((await self.client.get("/api/partners/config")).json()["acceptanceEnabled"])


class CsvSafetyTests(unittest.TestCase):
    def test_csv_formulas_with_leading_whitespace_are_escaped(self):
        for value in ("=1+1", "+CMD", "-1+1", "@SUM(A:A)", "\t =1", "\r\n=1"):
            self.assertTrue(_csv_safe(value).startswith("'"))
        self.assertEqual(_csv_safe("Plain company"), "Plain company")


if __name__ == "__main__":
    unittest.main()
