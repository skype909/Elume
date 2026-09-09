# Historical-v010 PostgreSQL bootstrap and adoption

`bootstrap_v010.sql` is the reviewed, schema-only starting point for a brand
new Elume PostgreSQL database. It creates the historical PostgreSQL schema
after migrations `001` through `010`, rather than current ORM metadata, and
records historical versions `001` through `010` in `schema_migrations`.

Historical v010 includes legacy `notes.size_bytes` and `tests.size_bytes`
compatibility columns plus migration-era indexes through 010. It deliberately
excludes the unversioned CAT4 `cohort_key`/`cohort_name` fields; a future
explicit 011 migration will bridge v010 to the current CAT4 cohort schema.

Run it only through the explicit runner:

```powershell
cd backend
python -m schema.bootstrap_v010 --database-url "postgresql+psycopg2://..."
```

The bootstrap runner fails closed:

- an empty database is initialized transactionally;
- a database that already has `schema_migrations` is refused; and
- a non-empty database without that ledger is refused unchanged, pending an
  explicitly reviewed adoption procedure.

For an existing, verified historical-v010 database with no ledger, first perform a
read-only check:

```powershell
cd backend
python -m schema.adopt_existing_v010 --check --database-url "postgresql+psycopg2://..."
```

Only after separate approval and a passing check can the ledger be adopted:

```powershell
python -m schema.adopt_existing_v010 --apply --confirm-v010-adoption `
  --expected-database "elume" --database-url "postgresql+psycopg2://..."
```

The adoption tool validates against the historical-v010 fingerprint, not
current ORM metadata. It refuses unledgered databases that are schema-ahead
(including CAT4 cohort columns), as well as empty, tracked, unknown, or
schema-incompatible databases. It is transactional and creates only
`schema_migrations` plus the incorporated historical rows. It never repairs
schema objects and is never run by FastAPI startup.

Workflow:

- empty DB → `bootstrap_v010` → ledger `001`–`010` → explicit migration
  `011+`;
- verified existing historical v010 → read-only adoption check → explicitly
  approved adoption → ledger `001`–`010` → explicit migration `011+`; and
- unknown/non-matching DB → refuse and investigate manually.

The bootstrap deliberately contains no application or sample data. Normal
FastAPI startup performs no schema DDL, seeding, backfill, database query, or
database connection. Bootstrap/adoption and all applicable explicit migrations
must complete before the application is started. The legacy `seed_classes()`
and class-access backfill helpers remain maintenance-only code; they are never
called automatically during application startup.

## Account-entitlement migration 012

Migration `012` follows exactly ledgered `001`–`011` and creates only the
auditable `school_email_domains` and `user_access_grants` tables. It is
explicit, transactional and never runs at application startup. Existing users
are not linked automatically. Domain linking is a separately approved,
admin-controlled operation and must check a verified email, active school and
available teacher seat before it writes anything.

### Explicit school-domain linking

The linker is never run by application startup. Its read-only report and its
separately approved write operation are:

```powershell
python -m schema.link_school_domains --check --school-id 123 --domain school.example `
  --expected-database elume --database-url-env DATABASE_URL
python -m schema.link_school_domains --apply --confirm-school-domain-link `
  --school-id 123 --domain school.example --actor-user-id 456 `
  --expected-database elume --database-url-env DATABASE_URL
```

The URL is accepted only through the named environment variable and is never
printed. Apply locks the domain and school, verifies the active verified
platform-admin actor, refuses conflicts or capacity shortfalls atomically, and
records one `school_domain_linked` audit entry per newly attached teacher.
Registering a real school domain is a separate production operation requiring
explicit approval.

## Durable Stripe webhook inbox migration 013

Migration `013` follows exactly ledgered `001`–`012` and creates the
`stripe_webhook_events` durable inbox. It is schema-only: it does not enable
Stripe events, process a webhook, contact Stripe, or alter an account. The
inbox stores only an allowlisted minimized event projection and a SHA-256
fingerprint; raw payloads, request headers, signatures, payment methods, card
data and billing addresses must never be stored there.

The runner uses a distinct transaction-scoped advisory lock, validates the
complete v012 state before changing anything, and records `013` in the same
transaction as the DDL. Its explicit operations are:

```powershell
cd backend
python -m schema.migrate_013_stripe_webhook_inbox --check `
  --expected-database elume --database-url-env DATABASE_URL
python -m schema.migrate_013_stripe_webhook_inbox --apply `
  --confirm-migration-013 --expected-database elume `
  --database-url-env DATABASE_URL
python -m schema.migrate_013_stripe_webhook_inbox --verify-applied `
  --expected-database elume --database-url-env DATABASE_URL
```

The guarded `--down --confirm-migration-013-down` path is allowed only for an
otherwise exact v013 database with an empty inbox. It refuses if any webhook
history exists and never deletes webhook history.

## AAC Planner migration 014

Migration `014` follows exactly ledgered `001`–`013`. It adds the disabled-by-
default per-class AAC flag and private AAC project, revision, progress and
practical-session tables. It is schema-only and is never run by FastAPI
startup. Calendar milestones are application data created only after a teacher
approves a plan; the migration itself creates none.

```powershell
cd backend
python -m schema.migrate_014_aac_planner --check `
  --expected-database elume --database-url-env DATABASE_URL
python -m schema.migrate_014_aac_planner --apply `
  --confirm-migration-014 --expected-database elume `
  --database-url-env DATABASE_URL
python -m schema.migrate_014_aac_planner --verify-applied `
  --expected-database elume --database-url-env DATABASE_URL
```

The guarded `--down --confirm-migration-014-down` path is permitted only when
there are no AAC projects, revisions, progress/session records, AAC calendar
milestones, or AAC-enabled classes. If any exist, use a forward corrective
migration rather than deleting teaching history or changing linked calendar
data.

## CAT4 cohort migration 011

`20260905_011_cat4_cohort_schema` is the first ledger-aware forward migration.
It requires exactly tracked versions `001` through `010`, validates the full
historical-v010 fingerprint, then atomically adds the three CAT4 cohort-key
indexes and six cohort columns before recording `011`. It is never run by
application startup. A transaction-scoped PostgreSQL advisory lock causes a
concurrent runner to refuse before waiting on migration DDL:

```powershell
cd backend
python -m schema.migrate_011_cat4_cohort_schema --check `
  --expected-database "elume" --database-url-env DATABASE_URL
python -m schema.migrate_011_cat4_cohort_schema --apply `
  --confirm-migration-011 --expected-database "elume" `
  --database-url-env DATABASE_URL
python -m schema.migrate_011_cat4_cohort_schema --verify-applied `
  --expected-database "elume" --database-url-env DATABASE_URL
```

The columns are backfilled as `default` / `Default Cohort`, become `NOT NULL`,
and intentionally have no PostgreSQL server defaults. The explicit, guarded
`--down --confirm-migration-011-down` path removes only those six columns,
their three indexes, and ledger version `011`.
