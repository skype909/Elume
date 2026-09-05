"""Core mode/dependency tests; no network or Stripe SDK calls."""
from __future__ import annotations
import os, sys, unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
BACKEND=Path(__file__).resolve().parents[1];sys.path.insert(0,str(BACKEND))
import main
from fastapi import HTTPException

class Query:
 def filter(self,*_): return self
 def all(self): return []
class DB:
 def __init__(self):self.query=Mock(return_value=Query())
def user(**kw):
 d=dict(id=7,is_active=True,email_verified=True,role='teacher',school_id=None,school=None,subscription_status='inactive',trial_ends_at=None,subscription_expires_at=None,payment_recovery_deadline_at=None);d.update(kw);return SimpleNamespace(**d)
class Request: method='GET';url=SimpleNamespace(path='/classes')
class Core(unittest.TestCase):
 def setUp(self):self.old=os.environ.get('ELUME_ENTITLEMENT_MODE');os.environ.pop('ELUME_ENTITLEMENT_MODE',None)
 def tearDown(self):
  if self.old is None:os.environ.pop('ELUME_ENTITLEMENT_MODE',None)
  else:os.environ['ELUME_ENTITLEMENT_MODE']=self.old
 def test_off_default_blank_and_no_query(self):
  for value in (None,'','  '):
   if value is None:os.environ.pop('ELUME_ENTITLEMENT_MODE',None)
   else:os.environ['ELUME_ENTITLEMENT_MODE']=value
   db=DB();self.assertIs(main.get_current_user(user(),db,Request()),main.get_current_user(user(),db,Request())) if False else self.assertIsNotNone(main.get_current_user(user(),db,Request()));db.query.assert_not_called()
 def test_invalid_mode(self):
  os.environ['ELUME_ENTITLEMENT_MODE']='bad'
  with self.assertRaisesRegex(RuntimeError,'ELUME_ENTITLEMENT_MODE'):main.get_current_user(user(),DB(),Request())
 def test_report_logs_only_denial(self):
  os.environ['ELUME_ENTITLEMENT_MODE']='report';db=DB()
  with patch.object(main.logger,'info') as log:main.get_current_user(user(),db,Request());log.assert_called_once();self.assertNotIn('email',str(log.call_args));self.assertNotIn('stripe',str(log.call_args).lower())
  os.environ['ELUME_ENTITLEMENT_MODE']='report';db=DB()
  with patch.object(main.logger,'info') as log:main.get_current_user(user(role='platform_admin'),db,Request());log.assert_not_called()
 def test_enforce_and_entitled(self):
  os.environ['ELUME_ENTITLEMENT_MODE']='enforce'
  with self.assertRaises(HTTPException) as raised:main.get_current_user(user(),DB(),Request())
  self.assertEqual(raised.exception.status_code,403);self.assertEqual(raised.exception.detail,{'code':'entitlement_required','reason':'subscription_inactive'})
  self.assertIs(main.get_current_user(user(role='platform_admin'),DB(),Request()).id,7)
 def test_trial_and_identity_inactive(self):
  os.environ['ELUME_ENTITLEMENT_MODE']='enforce';self.assertEqual(main.get_current_user(user(subscription_status='trialing',trial_ends_at=datetime.utcnow()+timedelta(seconds=1)),DB(),Request()).id,7)
  class Q:
   def filter(self,*_):return self
   def first(self):return user(is_active=False)
  with self.assertRaises(HTTPException) as err:main.get_authenticated_user('Bearer x',SimpleNamespace(query=lambda *_:Q()))
  self.assertEqual(err.exception.status_code,401)
