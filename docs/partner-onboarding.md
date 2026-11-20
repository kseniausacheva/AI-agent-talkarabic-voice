# La Royal Event partner register

The existing CRM now has `/partners`, linked from the MICE broadcast view. It uses the existing administrator login and backend database. Partner profiles and their review history are separate from newsletter subscribers and school leads.

Administrators can search profiles, filter by review status, record an assignee and next contact date, append notes and export the filtered register as CSV. The API never subscribes a partner or sends mail. Marketing choices and privacy acknowledgement versions are stored separately.

The public intake endpoint is `POST /api/partners`; it is **closed by default** through `PARTNER_INTAKE_ENABLED=false`. `/api/partners/config` reports its state. Before opening it, publish the final company identity/privacy notice, align the form's limits, add the exact portal origin to `ALLOWED_ORIGINS`, and test a complete application. The portal at `partners.royaleventandmice.com` is not active until its DNS validation records are set. Do not reuse school newsletter groups for onboarding.

Electronic agreement acceptance is deliberately closed in this release. Agreement draft snapshots are immutable, with content hashes; their presence is not a partner acceptance. A final legal version, verified signatory workflow and durable confirmation must be implemented before enabling assent. The current company registry evidence requires review of joint signing authority.

`POST /api/partners/demo` and `DELETE /api/partners/demo` are administrator-only review helpers scoped to one visibly marked test record. They never send mail or delete ordinary partner records. Do not use real contact details as a demo.

Backend verification: `python -m unittest discover -s tests -p test_partners.py` from `backend/` with FastAPI, SQLAlchemy, aiosqlite, httpx, pydantic-settings, PyJWT and python-multipart installed. Tests use isolated SQLite and do not load Whisper or start schedules. Frontend verification: `npx tsc --noEmit` and `npm run build` from `frontend/`.

Deployment is additive: new partner tables are registered with the existing startup `Base.metadata.create_all`; existing tables are unchanged. Back up the SQLite database through its backup API before the first backend deployment. Git push deploys the frontend to the existing Vercel project; the backend needs a separate Coolify deployment. Confirm both revisions and preserve the persistent `/app/data` volume.
