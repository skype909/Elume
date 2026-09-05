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

The bootstrap deliberately contains no application or sample data. The legacy
`seed_classes()` behavior remains separate application-startup behavior until
the later startup-hardening phase removes it.
