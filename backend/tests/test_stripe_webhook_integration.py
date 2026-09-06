"""Route-level durable webhook tests; Stripe signature construction is mocked only."""
from __future__ import annotations

import asyncio, os, sys, unittest, uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND=Path(__file__).resolve().parents[1];sys.path.insert(0,str(BACKEND))
from schema.bootstrap_v010 import apply_bootstrap
from schema.migrate_011_cat4_cohort_schema import apply_migration as apply_011
from schema.migrate_012_account_entitlements import apply_migration as apply_012
from schema.migrate_013_stripe_webhook_inbox import apply_migration as apply_013
RUN=os.getenv('ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS')=='1'

def raw(kind, user_id, *, event_id=None, created=1788696000, sub='sub_a', status='active', period=1789214400):
    obj={'id':sub,'customer':'cus_a','status':status,'created':created,'current_period_end':period,
         'trial_end':period,'cancel_at_period_end':False,'metadata':{'user_id':str(user_id)},
         'items':{'data':[{'price':{'recurring':{'interval':'month'}}}]}}
    if kind=='checkout.session.completed': obj={'id':'cs_a','customer':'cus_a','subscription':sub,'payment_status':'paid','mode':'subscription','metadata':{'user_id':str(user_id)}}
    if kind.startswith('invoice.') : obj={'id':'in_'+sub,'customer':'cus_a','subscription':sub,'status':'paid','paid':kind=='invoice.paid','period_end':period,'metadata':{'user_id':str(user_id)}}
    return {'id':event_id or 'evt_'+uuid.uuid4().hex,'type':kind,'created':created,'livemode':True,'api_version':'2026-08-01','data':{'object':obj}}

class Request:
    headers={'stripe-signature':'verified'}
    async def body(self): return b'not persisted'

@unittest.skipUnless(RUN,'set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1')
class WebhookIntegration(unittest.TestCase):
 def setUp(self):
  from db import DATABASE_URL
  self.source=make_url(DATABASE_URL)
  if self.source.drivername.split('+',1)[0]!='postgresql' or self.source.host not in {'127.0.0.1','localhost','::1'}: self.skipTest('loopback PostgreSQL required')
  self.admin=self.source.set(database='postgres');self.dbs=[]
 def tearDown(self):
  for name in self.dbs:
   e=create_engine(self.admin,isolation_level='AUTOCOMMIT')
   with e.connect() as c:
    c.execute(text('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:n AND pid<>pg_backend_pid()'),{'n':name});c.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
   e.dispose()
 def setup_db(self):
  name='elume_webhook_'+uuid.uuid4().hex[:10];e=create_engine(self.admin,isolation_level='AUTOCOMMIT')
  with e.connect() as c:c.execute(text(f'CREATE DATABASE "{name}"'))
  e.dispose();self.dbs.append(name);url=self.source.set(database=name).render_as_string(hide_password=False)
  apply_bootstrap(url);apply_011(url,expected_database=name,confirm_migration_011=True);apply_012(url,expected_database=name,confirm_migration_012=True);apply_013(url,expected_database=name,confirm_migration_013=True)
  import main,models
  maker=sessionmaker(bind=create_engine(url));
  with maker.begin() as s:
   u=models.UserModel(email='webhook@example.test',password_hash='x',email_verified=True);s.add(u);s.flush();uid=u.id
  return main,models,maker,uid
 def call(self,main,maker,payload,send=lambda *a:None):
  with patch.object(main,'SessionLocal',maker),patch.object(main,'STRIPE_SECRET_KEY','live'),patch.object(main,'STRIPE_WEBHOOK_SECRET','secret'),patch.object(main.stripe.Webhook,'construct_event',return_value=payload),patch.object(main,'_send_email',side_effect=send):
   return asyncio.run(main.stripe_billing_webhook(Request()))
 def test_supported_events_duplicate_conflict_and_payment_state(self):
  main,models,maker,uid=self.setup_db()
  for i,kind in enumerate(('checkout.session.completed','customer.subscription.created','customer.subscription.updated','invoice.paid','invoice.payment_failed')):
   response=self.call(main,maker,raw(kind,uid,created=1788696000+i,period=1789214400+i));self.assertEqual(response.status_code,200)
  with maker() as s:
   u=s.get(models.UserModel,uid);self.assertEqual(u.subscription_status,'past_due');self.assertIsNotNone(u.payment_recovery_deadline_at);self.assertIsNotNone(u.payment_failed_notice_sent_at)
   self.assertEqual(s.query(models.StripeWebhookEventModel).filter_by(processing_state='processed').count(),5)
  paid=raw('invoice.paid',uid,event_id='evt_same',period=1789219999);self.assertEqual(self.call(main,maker,paid).status_code,200)
  self.assertEqual(self.call(main,maker,paid).status_code,200)
  changed=raw('invoice.paid',uid,event_id='evt_same',period=1789220000)
  with self.assertRaises(main.HTTPException) as conflict:self.call(main,maker,changed)
  self.assertEqual(conflict.exception.status_code,409)
  with maker() as s:self.assertEqual(s.query(models.StripeWebhookEventModel).filter_by(stripe_event_id='evt_same').count(),1)
 def test_ordering_old_delete_invalid_signature_and_public_route(self):
  main,models,maker,uid=self.setup_db()
  self.assertTrue(any(getattr(r,'path',None)=='/billing/webhook' and not r.dependant.dependencies for r in main.app.routes))
  self.assertEqual(self.call(main,maker,raw('customer.subscription.created',uid,sub='sub_new',created=200,period=9999999999)).status_code,200)
  for kind in ('customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'):
   self.assertEqual(self.call(main,maker,raw(kind,uid,sub='sub_old',created=201)).status_code,200)
  with maker() as s:
   u=s.get(models.UserModel,uid);self.assertEqual(u.stripe_subscription_id,'sub_new');self.assertEqual(u.subscription_status,'active')
   self.assertEqual(s.query(models.StripeWebhookEventModel).filter_by(processing_state='ignored').count(),4)
  with patch.object(main,'STRIPE_SECRET_KEY','live'),patch.object(main,'STRIPE_WEBHOOK_SECRET','secret'),patch.object(main.stripe.Webhook,'construct_event',side_effect=ValueError('bad')):
   with self.assertRaises(main.HTTPException) as raised: asyncio.run(main.stripe_billing_webhook(Request()))
  self.assertEqual(raised.exception.status_code,400)
 def test_notification_failure_does_not_rollback_and_unsupported_is_ignored(self):
  main,models,maker,uid=self.setup_db()
  self.assertEqual(self.call(main,maker,raw('invoice.payment_failed',uid),send=lambda *a:(_ for _ in ()).throw(RuntimeError())).status_code,200)
  with maker() as s:
   u=s.get(models.UserModel,uid);self.assertEqual(u.subscription_status,'past_due');self.assertIsNone(u.payment_failed_notice_sent_at)
  self.assertEqual(self.call(main,maker,raw('charge.succeeded',uid)).status_code,200)
  with maker() as s:self.assertEqual(s.query(models.StripeWebhookEventModel).filter_by(processing_state='ignored').count(),1)
