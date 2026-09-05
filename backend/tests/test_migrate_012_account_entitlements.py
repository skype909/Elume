"""Disposable local PostgreSQL tests for ledger-gated entitlement migration 012."""
from __future__ import annotations
import os, sys, unittest, uuid
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BACKEND=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(BACKEND))
from schema.bootstrap_v010 import apply_bootstrap
from schema.migrate_011_cat4_cohort_schema import apply_migration as apply_011, EXPECTED_POST_MIGRATION_VERSIONS as V011
from schema.migrate_012_account_entitlements import (apply_migration, check_migration, verify_applied_migration, apply_down_migration, MigrationRefused, MIGRATION_ADVISORY_LOCK_KEY, EXPECTED_POST_MIGRATION_VERSIONS as V012)

RUN=os.getenv('ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS')=='1'
@unittest.skipUnless(RUN,'set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1 for local PostgreSQL tests')
class Migration012Tests(unittest.TestCase):
 def setUp(self):
  from db import DATABASE_URL
  self.source=make_url(DATABASE_URL)
  if self.source.drivername.split('+')[0]!='postgresql' or self.source.host not in {'127.0.0.1','localhost','::1'}:self.skipTest('requires loopback PostgreSQL')
  self.admin=self.source.set(database='postgres');self.dbs=[]
 def tearDown(self):
  for name in self.dbs:
   e=create_engine(self.admin,isolation_level='AUTOCOMMIT')
   try:
    with e.connect() as c:
     c.execute(text('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:n AND pid<>pg_backend_pid()'),{'n':name});c.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
   finally:e.dispose()
 def new(self):
  name='elume_m012_'+uuid.uuid4().hex[:10];e=create_engine(self.admin,isolation_level='AUTOCOMMIT')
  try:
   with e.connect() as c:c.execute(text(f'CREATE DATABASE "{name}"'))
  finally:e.dispose()
  self.dbs.append(name);url=self.source.set(database=name).render_as_string(hide_password=False);apply_bootstrap(url);apply_011(url,expected_database=name,confirm_migration_011=True);return name,url
 def tables(self,c):return {r[0] for r in c.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'"))}
 def test_successful_upgrade(self):
  name,url=self.new();check_migration(url,expected_database=name);apply_migration(url,expected_database=name,confirm_migration_012=True);verify_applied_migration(url,expected_database=name)
  e=create_engine(url)
  try:
   with e.connect() as c:
    self.assertEqual(tuple(x[0] for x in c.execute(text('SELECT version FROM schema_migrations ORDER BY version'))),V012);self.assertTrue({'school_email_domains','user_access_grants'}<=self.tables(c))
  finally:e.dispose()
 def test_preservation(self):
  name,url=self.new();e=create_engine(url)
  try:
   with e.begin() as c:
    uid=c.execute(text("INSERT INTO users(email,password_hash,role,is_active,email_verified,subscription_status,created_at,launch_offer_applied,billing_onboarding_required,ai_daily_limit,ai_prompt_count,storage_used_bytes) VALUES('fixture@example.test','x','teacher',TRUE,TRUE,'inactive',CURRENT_TIMESTAMP,FALSE,FALSE,0,0,0) RETURNING id")).scalar_one();sid=c.execute(text("INSERT INTO schools(name,status,seat_limit,created_at,updated_at) VALUES('Fixture','active',2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id")).scalar_one();cid=c.execute(text("INSERT INTO classes(name,subject,is_archived) VALUES('Fixture','CAT4',FALSE) RETURNING id")).scalar_one();tid=c.execute(text("INSERT INTO topics(class_id,name) VALUES(:c,'Topic') RETURNING id"),{'c':cid}).scalar_one();c.execute(text("INSERT INTO notes(class_id,topic_id,filename,stored_path,size_bytes,uploaded_at) VALUES(:c,:t,'n','x',7,CURRENT_TIMESTAMP)"),{'c':cid,'t':tid})
   apply_migration(url,expected_database=name,confirm_migration_012=True)
   with e.connect() as c:
    self.assertEqual(c.execute(text("SELECT size_bytes FROM notes WHERE filename='n'")).scalar_one(),7);self.assertEqual(len(self.tables(c)-{'schema_migrations','school_email_domains','user_access_grants'}),42);self.assertEqual(c.execute(text("SELECT count(*) FROM information_schema.columns WHERE table_name='cat4_baseline_sets' AND column_name='cohort_key'")).scalar_one(),1)
  finally:e.dispose()
 def test_invalid_state_refusal(self):
  for kind in ('missing','extra','partial'):
   with self.subTest(kind=kind):
    name,url=self.new();e=create_engine(url)
    try:
     with e.begin() as c:
      if kind=='missing':c.execute(text("DELETE FROM schema_migrations WHERE version='011'"))
      elif kind=='extra':c.execute(text("INSERT INTO schema_migrations(version) VALUES('999')"))
      else:c.execute(text('CREATE TABLE school_email_domains(id INTEGER)'))
     with self.assertRaises(MigrationRefused):apply_migration(url,expected_database=name,confirm_migration_012=True)
    finally:e.dispose()
 def test_atomic_rollback(self):
  name,url=self.new();bad=Path(__file__).with_name('fixture_012_bad.sql');bad.write_text('CREATE TABLE school_email_domains (id INTEGER);\nSELECT does_not_exist();',encoding='utf8')
  try:
   with self.assertRaises(Exception):apply_migration(url,expected_database=name,confirm_migration_012=True,sql_path=bad)
  finally:bad.unlink(missing_ok=True)
  e=create_engine(url)
  try:
   with e.connect() as c:self.assertNotIn('school_email_domains',self.tables(c));self.assertEqual(tuple(x[0] for x in c.execute(text('SELECT version FROM schema_migrations ORDER BY version'))),V011)
  finally:e.dispose()
 def test_advisory_lock(self):
  name,url=self.new();e=create_engine(url);c=e.connect();tx=c.begin()
  try:
   c.execute(text('SELECT pg_advisory_xact_lock(:k)'),{'k':MIGRATION_ADVISORY_LOCK_KEY})
   with self.assertRaises(MigrationRefused):apply_migration(url,expected_database=name,confirm_migration_012=True)
  finally:tx.rollback();c.close();e.dispose()
 def test_guarded_down_and_verifier_tamper(self):
  name,url=self.new();apply_migration(url,expected_database=name,confirm_migration_012=True);e=create_engine(url)
  try:
   with e.begin() as c:c.execute(text('DROP INDEX ix_school_email_domains_school_active'))
   with self.assertRaises(MigrationRefused):verify_applied_migration(url,expected_database=name)
   with e.begin() as c:c.execute(text('CREATE INDEX ix_school_email_domains_school_active ON school_email_domains (school_id,is_active)'))
  finally:e.dispose()
 def test_audit_action_constraint_and_down_history_guard(self):
  name,url=self.new();apply_migration(url,expected_database=name,confirm_migration_012=True);e=create_engine(url)
  try:
   with e.begin() as c:
    uid=c.execute(text("INSERT INTO users(email,password_hash,role,is_active,email_verified,subscription_status,created_at,launch_offer_applied,billing_onboarding_required,ai_daily_limit,ai_prompt_count,storage_used_bytes) VALUES('audit@example.test','x','teacher',TRUE,TRUE,'inactive',CURRENT_TIMESTAMP,FALSE,FALSE,0,0,0) RETURNING id")).scalar_one();sid=c.execute(text("INSERT INTO schools(name,status,seat_limit,created_at,updated_at) VALUES('Audit','active',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id")).scalar_one()
    for action in ('invitation_created','invitation_resent','invitation_revoked','invitation_accepted','teacher_deactivated','teacher_reactivated','school_admin_invitation_created','school_admin_invitation_accepted','school_domain_linked'): c.execute(text("INSERT INTO school_admin_audit_log(school_id,actor_user_id,target_user_id,action,created_at) VALUES(:s,:u,:u,:a,CURRENT_TIMESTAMP)"),{'s':sid,'u':uid,'a':action})
    nested=c.begin_nested()
    with self.assertRaises(Exception): c.execute(text("INSERT INTO school_admin_audit_log(school_id,actor_user_id,action,created_at) VALUES(:s,:u,'invalid',CURRENT_TIMESTAMP)"),{'s':sid,'u':uid})
    nested.rollback()
   with self.assertRaises(Exception):apply_down_migration(url,expected_database=name,confirm_migration_012_down=True)
   with e.connect() as c:self.assertIn('school_email_domains',self.tables(c));self.assertEqual(tuple(x[0] for x in c.execute(text('SELECT version FROM schema_migrations ORDER BY version'))),V012);self.assertEqual(c.execute(text("SELECT count(*) FROM school_admin_audit_log WHERE action='school_domain_linked'")).scalar_one(),1)
  finally:e.dispose()
 def test_guarded_down_restores_v011_without_domain_history(self):
  name,url=self.new();apply_migration(url,expected_database=name,confirm_migration_012=True);apply_down_migration(url,expected_database=name,confirm_migration_012_down=True);e=create_engine(url)
  try:
   with e.connect() as c:self.assertEqual(tuple(x[0] for x in c.execute(text('SELECT version FROM schema_migrations ORDER BY version'))),V011);self.assertFalse({'school_email_domains','user_access_grants'} & self.tables(c))
  finally:e.dispose()
