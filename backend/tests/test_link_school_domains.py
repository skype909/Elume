"""Opt-in loopback PostgreSQL tests for the explicit school-domain linker."""
from __future__ import annotations
import os, sys, unittest, uuid
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
BACKEND=Path(__file__).resolve().parents[1];sys.path.insert(0,str(BACKEND))
from schema.bootstrap_v010 import apply_bootstrap
from schema.migrate_011_cat4_cohort_schema import apply_migration as apply_011
from schema.migrate_012_account_entitlements import apply_migration as apply_012
from schema.link_school_domains import LinkRefused,apply,check,canonical_domain
RUN=os.getenv('ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS')=='1'
@unittest.skipUnless(RUN,'set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1')
class DomainLinkTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  from db import DATABASE_URL
  u=make_url(DATABASE_URL)
  if u.host not in {'127.0.0.1','localhost','::1'}:raise unittest.SkipTest('loopback only')
  cls.admin=u.set(database='postgres');cls.names=[]
 @classmethod
 def tearDownClass(cls):
  e=create_engine(cls.admin,isolation_level='AUTOCOMMIT')
  try:
   with e.connect() as c:
    for n in cls.names:c.execute(text('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:n AND pid<>pg_backend_pid()'),{'n':n});c.execute(text(f'DROP DATABASE IF EXISTS "{n}"'))
  finally:e.dispose()
 def new(self):
  n='elume_domain_'+uuid.uuid4().hex[:10];self.names.append(n);e=create_engine(self.admin,isolation_level='AUTOCOMMIT')
  try:
   with e.connect() as c:c.execute(text(f'CREATE DATABASE "{n}"'))
  finally:e.dispose()
  u=self.admin.set(database=n).render_as_string(hide_password=False);apply_bootstrap(u);apply_011(u,expected_database=n,confirm_migration_011=True);apply_012(u,expected_database=n,confirm_migration_012=True);return n,u
 def ids(self,u,limit=2):
  e=create_engine(u)
  try:
   with e.begin() as c:
    admin=c.execute(text("INSERT INTO users(email,password_hash,role,is_active,email_verified,subscription_status,created_at,launch_offer_applied,billing_onboarding_required,ai_daily_limit,ai_prompt_count,storage_used_bytes) VALUES('admin@test.org','x','platform_admin',true,true,'inactive',now(),false,false,0,0,0) RETURNING id")).scalar_one();school=c.execute(text("INSERT INTO schools(name,status,seat_limit,created_at,updated_at) VALUES('S','active',:l,now(),now()) RETURNING id"),{'l':limit}).scalar_one();return admin,school
  finally:e.dispose()
 def user(self,e,email,**kw):
  d={'role':'teacher','active':True,'verified':True,'school':None};d.update(kw)
  return e.execute(text("INSERT INTO users(email,password_hash,role,school_id,is_active,email_verified,subscription_status,created_at,launch_offer_applied,billing_onboarding_required,ai_daily_limit,ai_prompt_count,storage_used_bytes) VALUES(:email,'x',:role,:school,:active,:verified,'inactive',now(),false,false,0,0,0) RETURNING id"),{'email':email,**d}).scalar_one()
 def test_canonical_and_check_read_only(self):
  self.assertEqual(canonical_domain(' Example.TEST '),'example.test')
  for x in ('@x.test','https://x.test','x.test/a','*.x.test','bad domain','x'): self.assertRaises(LinkRefused,canonical_domain,x)
  n,u=self.new();a,s=self.ids(u);e=create_engine(u)
  try:
   with e.begin() as c:self.user(c,'one@evilpreskilkenny.ie');self.user(c,'two@subdomain.preskilkenny.ie');eligible=self.user(c,'ok@preskilkenny.ie')
   r=check(u,expected_database=n,school_id=s,domain='PRESKILKENNY.IE');self.assertEqual(r['eligible'],[eligible]);self.assertIsNone(r['mapping'])
   with e.connect() as c:self.assertEqual(c.execute(text('SELECT count(*) FROM school_email_domains')).scalar_one(),0)
  finally:e.dispose()
 def test_apply_idempotency_capacity_and_audit(self):
  n,u=self.new();a,s=self.ids(u,1);e=create_engine(u)
  try:
   with e.begin() as c:uid=self.user(c,'teacher@example.test');inactive=self.user(c,'i@example.test',active=False);unverified=self.user(c,'u@example.test',verified=False);nonteacher=self.user(c,'n@example.test',role='school_admin')
   r=apply(u,expected_database=n,school_id=s,domain='EXAMPLE.TEST',actor_user_id=a,confirm_school_domain_link=True);self.assertEqual(r['eligible'],[uid])
   apply(u,expected_database=n,school_id=s,domain='example.test',actor_user_id=a,confirm_school_domain_link=True)
   with e.connect() as c:self.assertEqual(c.execute(text('SELECT count(*) FROM school_admin_audit_log WHERE action=\'school_domain_linked\'')).scalar_one(),1);self.assertEqual(c.execute(text('SELECT school_id FROM users WHERE id=:i'),{'i':uid}).scalar_one(),s);self.assertIsNone(c.execute(text('SELECT school_id FROM users WHERE id=:i'),{'i':inactive}).scalar_one())
  finally:e.dispose()
 def test_conflict_mapping_actor_and_capacity_refuse_atomically(self):
  n,u=self.new();a,s=self.ids(u,0);e=create_engine(u)
  try:
   with e.begin() as c:uid=self.user(c,'x@example.test');other=c.execute(text("INSERT INTO schools(name,status,seat_limit,created_at,updated_at) VALUES('O','active',2,now(),now()) RETURNING id")).scalar_one();self.user(c,'y@example.test',school=other)
   with self.assertRaises(LinkRefused):apply(u,expected_database=n,school_id=s,domain='example.test',actor_user_id=a,confirm_school_domain_link=True)
   with e.connect() as c:self.assertEqual(c.execute(text('SELECT count(*) FROM school_email_domains')).scalar_one(),0);self.assertIsNone(c.execute(text('SELECT school_id FROM users WHERE id=:i'),{'i':uid}).scalar_one())
  finally:e.dispose()
