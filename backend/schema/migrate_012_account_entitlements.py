"""Fail-closed, ledger-gated PostgreSQL account-entitlement migration 012."""
from __future__ import annotations
import argparse, os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from schema.migrate_011_cat4_cohort_schema import EXPECTED_POST_MIGRATION_VERSIONS as V011, MigrationRefused, _public_base_tables, _require_schema, _require_versions, v011_fingerprint
from schema.adopt_existing_v010 import FINGERPRINT_PATH, validate_schema_fingerprint

MIGRATION_VERSION='012'; MIGRATION_ADVISORY_LOCK_KEY=81_102_012
EXPECTED_PRE_MIGRATION_VERSIONS=V011; EXPECTED_POST_MIGRATION_VERSIONS=V011+(MIGRATION_VERSION,)
UP_SQL=Path(__file__).parents[1]/'migrations'/'20260905_012_account_entitlements.up.sql'
DOWN_SQL=Path(__file__).parents[1]/'migrations'/'20260905_012_account_entitlements.down.sql'
TABLES={'school_email_domains','user_access_grants'}

def _db(url, expected):
    if make_url(url).database != expected: raise MigrationRefused('Migration 012 refused: unexpected database.')
def _lock(c):
    if not c.execute(text('SELECT pg_try_advisory_xact_lock(:key)'), {'key':MIGRATION_ADVISORY_LOCK_KEY}).scalar_one(): raise MigrationRefused('Migration 012 refused: another migration-012 transaction is active.')
def _sql(c,path):
    script='\n'.join(x for x in path.read_text(encoding='utf-8').splitlines() if not x.lstrip().startswith('--'))
    if 'DO $$' in script:
        before,after=script.split('DO $$',1); block,script=after.split('$$;',1)
        for statement in before.split(';'):
            if statement.strip(): c.execute(text(statement))
        c.execute(text('DO $$'+block+'$$'))
    for statement in script.split(';'):
        if statement.strip(): c.execute(text(statement))
def _pre(c):
    _require_versions(c,EXPECTED_PRE_MIGRATION_VERSIONS); _require_schema(c,v011_fingerprint(FINGERPRINT_PATH),'preflight')
    if TABLES & _public_base_tables(c): raise MigrationRefused('Migration 012 refused: entitlement tables already exist.')
def _verify_definition(c):
    cols={(r[0],r[1]):r[2:] for r in c.execute(text("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY(:t)"),{'t':list(TABLES)})}
    expected={
      ('school_email_domains','id'):('integer','NO',None),('school_email_domains','school_id'):('integer','NO',None),('school_email_domains','domain'):('character varying','NO',None),('school_email_domains','is_active'):('boolean','NO','true'),('school_email_domains','created_at'):('timestamp without time zone','NO','CURRENT_TIMESTAMP'),('school_email_domains','created_by_user_id'):('integer','YES',None),('school_email_domains','revoked_at'):('timestamp without time zone','YES',None),('school_email_domains','revoked_by_user_id'):('integer','YES',None),
      ('user_access_grants','id'):('integer','NO',None),('user_access_grants','user_id'):('integer','NO',None),('user_access_grants','grant_type'):('character varying','NO',None),('user_access_grants','reason'):('text','NO',None),('user_access_grants','starts_at'):('timestamp without time zone','NO','CURRENT_TIMESTAMP'),('user_access_grants','expires_at'):('timestamp without time zone','YES',None),('user_access_grants','granted_by_user_id'):('integer','NO',None),('user_access_grants','revoked_at'):('timestamp without time zone','YES',None),('user_access_grants','revoked_by_user_id'):('integer','YES',None),('user_access_grants','revocation_reason'):('text','YES',None),('user_access_grants','created_at'):('timestamp without time zone','NO','CURRENT_TIMESTAMP')}
    bad=[f'column {a}.{b}' for (a,b),want in expected.items() if (got:=cols.get((a,b))) is None or got[:2]!=want[:2] or (want[2] and (got[2] or '').lower()!=want[2].lower())]
    if set(cols)!=set(expected): bad.append('unexpected/missing v012 columns')
    cons={r[0]:r[1] for r in c.execute(text("SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=ANY(ARRAY['school_email_domains'::regclass,'user_access_grants'::regclass])"))}
    for n in ('school_email_domains_pkey','user_access_grants_pkey','uq_school_email_domains_domain','ck_school_email_domains_domain_canonical','ck_school_email_domains_revocation','ck_user_access_grants_type','ck_user_access_grants_window','ck_user_access_grants_revocation'):
        if n not in cons: bad.append('constraint '+n)
    audit=c.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='school_admin_audit_log'::regclass AND conname='ck_school_admin_audit_log_action'")).scalar_one_or_none()
    audit_actions=('invitation_created','invitation_resent','invitation_revoked','invitation_accepted','teacher_deactivated','teacher_reactivated','school_admin_invitation_created','school_admin_invitation_accepted','school_domain_linked')
    if audit is None or any("'%s'" % action not in audit for action in audit_actions) or audit.count("'") != len(audit_actions)*2: bad.append('constraint ck_school_admin_audit_log_action')
    for needle in ('FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT','FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT','FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON DELETE RESTRICT','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT','FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT'):
        if not any(needle in x for x in cons.values()): bad.append('foreign key '+needle)
    ind={r[0]:r[1] for r in c.execute(text("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY(:t)"),{'t':list(TABLES)})}
    for n,needle in {'ix_school_email_domains_school_active':'(school_id, is_active)','ix_user_access_grants_user_active':'(user_id, starts_at, expires_at)'}.items():
        if n not in ind or needle not in ind[n]: bad.append('index '+n)
    if bad: raise MigrationRefused('Migration 012 verification refused: '+'; '.join(bad))
def check_migration(url,*,expected_database):
    _db(url,expected_database); e=create_engine(url)
    try:
        with e.connect() as c:_pre(c)
    finally:e.dispose()
def apply_migration(url,*,expected_database,confirm_migration_012,sql_path=UP_SQL):
    if not confirm_migration_012:raise MigrationRefused('Migration 012 requires --confirm-migration-012.')
    _db(url,expected_database);e=create_engine(url)
    try:
      with e.begin() as c:_lock(c);_pre(c);_sql(c,sql_path);c.execute(text("INSERT INTO schema_migrations(version) VALUES('012')"))
    finally:e.dispose()
def verify_applied_migration(url,*,expected_database):
    _db(url,expected_database);e=create_engine(url)
    try:
      with e.connect() as c:
       _require_versions(c,EXPECTED_POST_MIGRATION_VERSIONS)
       mismatches=validate_schema_fingerprint(c,v011_fingerprint(FINGERPRINT_PATH),allowed_base_tables={'schema_migrations'}|TABLES)
       if mismatches: raise MigrationRefused('Migration 012 verification refused: '+'; '.join(mismatches))
       _verify_definition(c)
    finally:e.dispose()
def apply_down_migration(url,*,expected_database,confirm_migration_012_down):
    if not confirm_migration_012_down:raise MigrationRefused('Migration 012 down requires --confirm-migration-012-down.')
    _db(url,expected_database);e=create_engine(url)
    try:
      with e.begin() as c:
        _lock(c);_require_versions(c,EXPECTED_POST_MIGRATION_VERSIONS);_verify_definition(c);_sql(c,DOWN_SQL);c.execute(text("DELETE FROM schema_migrations WHERE version='012'"))
    finally:e.dispose()
def main():
 p=argparse.ArgumentParser();p.add_argument('--database-url-env',required=True);p.add_argument('--expected-database',required=True);p.add_argument('--check',action='store_true');p.add_argument('--apply',action='store_true');p.add_argument('--verify-applied',action='store_true');p.add_argument('--down',action='store_true');p.add_argument('--confirm-migration-012',action='store_true');p.add_argument('--confirm-migration-012-down',action='store_true');a=p.parse_args();url=os.getenv(a.database_url_env)
 if not url:p.error('database URL environment variable is empty')
 if sum((a.check,a.apply,a.verify_applied,a.down))!=1:p.error('choose exactly one operation')
 if a.check:check_migration(url,expected_database=a.expected_database)
 elif a.apply:apply_migration(url,expected_database=a.expected_database,confirm_migration_012=a.confirm_migration_012)
 elif a.verify_applied:verify_applied_migration(url,expected_database=a.expected_database)
 else:apply_down_migration(url,expected_database=a.expected_database,confirm_migration_012_down=a.confirm_migration_012_down)
 return 0
if __name__=='__main__':raise SystemExit(main())
