# Approved release integration checkpoint

- [x] Preserve original tracked diff: `C:\Elume_clean\release-input-20260917T214614.patch` (base `b87c893`).
- [x] Confirm release/production base `1917308`; production PostgreSQL 17.9 ledger through AAC `014`.
- [~] Zero-seat port begun in `frontend/src/SeatingPlanPage.tsx`.
- [~] Frontend saved-video integration: added `frontend/src/savedVideos.ts`; VideosPage CRUD and Whiteboard loader use the shared authorised import/list path. Backend API/model/migration still required.
- [ ] Homepage Student Hub integration.
- [ ] Reviewed Gaeilge corrections and account preference integration, preserving pilot gate.
- [~] Migration 015 SQL and runner drafted; requires full predecessor/postflight verification and PostgreSQL 17 tests.
- [ ] Focused tests, type check, production build, commit and artifact.
- [ ] Fresh production preflight/backups, push, migration, deployment and live observation.

Frontend saved-video verification: `npm ci` completed from the authoritative package lock (no lockfile changes). `node_modules/.bin/tsc.cmd --noEmit` passed. `npm test -- --watchAll=false --runInBand VideosPage.test.tsx WhiteBoardPage.integration.test.tsx` was invoked for existing focused consumers; no test result was returned before the execution window ended, so it must be rerun before release. These are mocked frontend checks only; backend integration remains outstanding.

Confirmed Whiteboard regression check: `npm test -- --watchAll=false --runInBand WhiteBoardPage.integration.test.tsx` exited `0`: 1 suite passed, 11 tests passed. The fixture now mocks `/classes/1/videos`, the shared service contract, while retaining the player and unchanged-board assertions. `VideosPage.test.tsx` does not exist; dedicated VideosPage/service coverage is still needed. Backend/API and PostgreSQL migration-015 verification remain outstanding.

Next: rerun/finish focused frontend tests, then port the backend SavedVideo model/schemas/endpoints and finish migration 015 tests.

Homepage pass: `frontend/src/LoginPage.tsx` now uses one shared yellow `StudentHubCard`: mobile placement immediately after branding and desktop placement after the naturally shortened login card. Removed the Stripe promotion, its three badges, and superseded Student Hub markup. The existing `/#/student` link remains keyboard accessible. `frontend/node_modules/.bin/tsc.cmd --noEmit` exited `0`.

Language preference pass: `frontend/src/i18n/UiLanguageContext.tsx` now stores versioned account-scoped metadata, fetches authenticated server preferences, uses recorded server timestamps over legacy browser values, initialises legacy preferences only when the server has no recorded timestamp, cancels stale account requests, and persists explicit selections. Type check exited `0`. Pilot availability/reviewer gates were not changed.

Backend saved-video API verification: added `backend/tests/test_saved_videos.py`. With process-local cryptographically random JWT_SECRET, `ELUME_UPLOADS_DIR=C:\Elume_clean\test-artifacts\saved-videos-uploads`, `DATABASE_URL=sqlite:///C:/Elume_clean/test-artifacts/saved-videos.db`, `ELUME_SKIP_DOTENV=1`, `PYTHONUTF8=1`, and `APP_ENV=development`, `python -m unittest backend.tests.test_saved_videos` exited `0`: SQLite, 2 tests run, 2 passed, 0 failed/errors. Covers CRUD, unauthenticated/other-owner denial, wrong-class IDs, duplicate conflict/rollback, class-scoped duplicates, and response fields. PostgreSQL-17 migration-015 verification remains outstanding.

Migration 015 PostgreSQL validation: native PostgreSQL 18 loopback instance at 127.0.0.1:55415; disposable database `elume_m015_test`. Applied established bootstrap then 011, 012, 013, AAC 014, followed by `schema.migrate_015_saved_videos_and_ui_language --check --apply --verify-applied` (exit 0). Ledger is 001–015. Verified users columns/default and saved_videos FK, per-class unique constraint and ordering index. Repeat apply exits 1 with ledger mismatch and makes no duplicate entry. This is PostgreSQL 18 evidence; production compatibility remains a PostgreSQL 17.9 operational check.
