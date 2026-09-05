from datetime import datetime,timedelta,timezone
from types import SimpleNamespace
import unittest
from entitlements import decide_entitlement,PROMOTIONAL_ANNUAL_OFFER_EXPIRES_AT
NOW=datetime(2026,9,5,12)
def u(**kw):
 d=dict(is_active=True,email_verified=True,role='teacher',school_id=None,subscription_status='inactive',trial_ends_at=None,subscription_expires_at=None,payment_recovery_deadline_at=None);d.update(kw);return SimpleNamespace(**d)
def g(**kw):
 d=dict(grant_type='pilot',starts_at=NOW-timedelta(days=1),expires_at=NOW+timedelta(days=1),revoked_at=None);d.update(kw);return SimpleNamespace(**d)
class Entitlements(unittest.TestCase):
 def d(self,*a):return decide_entitlement(*a,now=NOW)
 def test_identity_precedence(self):
  self.assertEqual(self.d(u(is_active=False,role='platform_admin')).code,'account_inactive');self.assertEqual(self.d(u(email_verified=False,role='platform_admin')).code,'email_unverified');self.assertTrue(self.d(u(role='platform_admin')).allowed)
 def test_school(self):
  self.assertTrue(self.d(u(school_id=1),SimpleNamespace(status='active')).allowed);self.assertFalse(self.d(u(school_id=1),SimpleNamespace(status='inactive')).allowed)
 def test_grant_boundaries_and_precedence(self):
  self.assertTrue(self.d(u(subscription_status='canceled'),None,[g()]).allowed);self.assertFalse(self.d(u(),None,[g(expires_at=NOW)]).allowed);self.assertFalse(self.d(u(),None,[g(starts_at=NOW+timedelta(seconds=1))]).allowed);self.assertFalse(self.d(u(),None,[g(revoked_at=NOW)]).allowed)
 def test_trials_paid_and_recovery(self):
  self.assertTrue(self.d(u(subscription_status='trialing',trial_ends_at=NOW+timedelta(seconds=1))).allowed);self.assertFalse(self.d(u(subscription_status='trialing',trial_ends_at=NOW)).allowed);self.assertTrue(self.d(u(subscription_status='active',subscription_expires_at=NOW+timedelta(seconds=1))).allowed);self.assertFalse(self.d(u(subscription_status='active')).allowed);self.assertFalse(self.d(u(subscription_status='active',subscription_expires_at=NOW)).allowed);self.assertTrue(self.d(u(subscription_status='past_due',payment_recovery_deadline_at=NOW+timedelta(seconds=1))).allowed);self.assertFalse(self.d(u(subscription_status='past_due',payment_recovery_deadline_at=NOW)).allowed)
 def test_denied_statuses(self):
  for status in ('canceled','unpaid','paused','incomplete','pending','inactive'):
   with self.subTest(status=status):self.assertFalse(self.d(u(subscription_status=status)).allowed)
 def test_promotion_and_aware_datetime(self):
  grant=g(grant_type='promotional_annual',expires_at=PROMOTIONAL_ANNUAL_OFFER_EXPIRES_AT);self.assertTrue(self.d(u(),None,[grant]).allowed);aware=NOW.replace(tzinfo=timezone.utc);self.assertTrue(decide_entitlement(u(subscription_status='trialing',trial_ends_at=aware+timedelta(seconds=1)),None,(),now=aware).allowed)
