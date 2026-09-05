# Final-v010 PostgreSQL bootstrap

`bootstrap_v010.sql` is the reviewed, schema-only starting point for a brand
new Elume PostgreSQL database. It creates the complete final-v010 schema and
records historical versions `001` through `010` in `schema_migrations`.

Run it only through the explicit runner:

```powershell
cd backend
python -m schema.bootstrap_v010 --database-url "postgresql+psycopg2://..."
```

The runner fails closed:

- an empty database is initialized transactionally;
- a database that already has `schema_migrations` is refused; and
- a non-empty database without that ledger is refused unchanged, pending an
  explicitly reviewed adoption procedure.

It is never run by FastAPI startup. Do not use it for an existing production
database. Future migrations start at `011` and require a ledger entry for the
previous version.

The bootstrap deliberately contains no application or sample data. The legacy
`seed_classes()` behavior remains separate application-startup behavior until
the later startup-hardening phase removes it.
