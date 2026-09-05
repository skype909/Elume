"""Core mode/dependency tests; no network or Stripe SDK calls."""
from __future__ import annotations
import ast, inspect, os, sys, unittest
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

 def test_route_classification_inventory(self):
  platform = (
   ('GET', '/platform-admin/schools', 'platform_admin_list_schools', 'require_platform_admin'),
   ('POST', '/platform-admin/schools', 'platform_admin_create_school', 'require_platform_admin'),
   ('GET', '/platform-admin/schools/{school_id}', 'platform_admin_school_detail', 'require_platform_admin'),
   ('PATCH', '/platform-admin/schools/{school_id}/branding', 'platform_admin_update_school_branding', 'require_platform_admin'),
   ('POST', '/platform-admin/schools/{school_id}/logo', 'platform_admin_upload_school_logo', 'require_platform_admin'),
   ('POST', '/platform-admin/schools/{school_id}/assign-admin', 'platform_admin_assign_school_admin', 'require_platform_admin'),
   ('POST', '/platform-admin/schools/{school_id}/admin-invitations', 'platform_admin_create_school_admin_invitation', 'require_platform_admin'),
   ('GET', '/platform-admin/entitlements', 'platform_admin_entitlement_report', 'require_platform_admin'),
   ('GET', '/platform-admin/users/{user_id}/access-grants', 'platform_admin_list_access_grants', 'require_platform_admin'),
   ('POST', '/platform-admin/users/{user_id}/access-grants', 'platform_admin_create_access_grant', 'require_platform_admin'),
   ('POST', '/platform-admin/access-grants/{grant_id}/revoke', 'platform_admin_revoke_access_grant', 'require_platform_admin'),
   ('GET', '/admin/users/export.csv', 'export_users_csv', '_require_super_admin'),
   ('GET', '/admin/users', 'admin_list_users', 'require_super_admin'),
   ('POST', '/admin/users', 'admin_create_user', 'require_super_admin'),
   ('POST', '/admin/users/reset-password', 'admin_reset_password', 'require_super_admin'),
   ('POST', '/admin/users/rename', 'admin_rename_user', 'require_super_admin'),
   ('DELETE', '/admin/users', 'admin_delete_user', 'require_super_admin'),
   ('POST', '/admin/classes/transfer', 'admin_transfer_class', 'require_super_admin'),
   ('POST', '/classes/{class_id}/cat4/baselines/{baseline_id}/reset', 'reset_cat4_baseline', 'require_super_admin'),
  )
  identity = (
   ('GET', '/auth/me', 'auth_me'),
   ('POST', '/billing/create-checkout-session', 'create_checkout_session'),
   ('POST', '/billing/create-portal-session', 'create_portal_session'),
   ('POST', '/billing/confirm-checkout-session', 'confirm_checkout_session'),
   ('POST', '/billing/start-trial', 'start_billing_trial'),
   ('GET', '/billing/me', 'billing_me'),
  )
  product = (
   ('GET', '/classes', 'get_classes'), ('PUT', '/classes/dashboard-order', 'update_dashboard_order'),
   ('GET', '/notes/{class_id}', 'list_notes'),
   ('GET', '/calendar-events', 'list_calendar_events'), ('POST', '/whiteboards', 'save_whiteboard_state'),
   ('POST', '/collab/create', 'collab_create'), ('POST', '/livequiz/create', 'livequiz_create'),
   ('GET', '/classes/{class_id}/cat4/meta', 'cat4_meta'), ('POST', '/ai/create-resources', 'ai_create_resources'),
   ('GET', '/storage/me', 'storage_me'), ('GET', '/school-resources', 'school_resources'),
   ('GET', '/teacher-admin/state', 'get_teacher_admin_state'), ('GET', '/student-access/{class_id}', 'get_student_access'),
  )
  school_admin = (
   ('GET', '/school-admin/departments', 'school_admin_list_departments'),
   ('POST', '/school-admin/invitations', 'school_admin_create_invitation'),
  )
  public_or_student = (
   ('POST', '/auth/login', 'auth_login'), ('POST', '/auth/register', 'auth_register'),
   ('POST', '/student/join/class', 'join_class_by_code'), ('POST', '/livequiz/{code}/join', 'livequiz_join'),
   ('POST', '/collab/{code}/join', 'collab_join'),
  )
  routes = {(method, route.path, route.endpoint.__name__): route
            for route in main.app.routes for method in getattr(route, 'methods', set())}

  def direct_dependencies(method, path, name):
   return [dep.call for dep in routes[(method, path, name)].dependant.dependencies]

  def all_dependencies(route):
   pending = list(route.dependant.dependencies)
   calls = []
   while pending:
    dependency = pending.pop()
    calls.append(dependency.call)
    pending.extend(dependency.dependencies)
   return calls

  for method, path, name, role_check in platform:
   deps = direct_dependencies(method, path, name)
   self.assertIn(main.get_authenticated_user, deps)
   self.assertNotIn(main.get_current_user, deps)
   self.assertNotIn(main.get_current_user, all_dependencies(routes[(method, path, name)]))
   self.assertIn(role_check, inspect.getsource(routes[(method, path, name)].endpoint))
  for method, path, name in identity:
   deps = direct_dependencies(method, path, name)
   self.assertIn(main.get_authenticated_user, deps)
   self.assertNotIn(main.get_current_user, deps)
   self.assertNotIn(main.get_current_user, all_dependencies(routes[(method, path, name)]))
  for method, path, name in product:
   self.assertIn(main.get_current_user, direct_dependencies(method, path, name))
  for method, path, name in school_admin:
   route = routes[(method, path, name)]
   self.assertIn(main.get_current_user, direct_dependencies(method, path, name))
   self.assertIn('_require_school_admin_school_id', inspect.getsource(route.endpoint))
  for method, path, name in public_or_student:
   deps = direct_dependencies(method, path, name)
   self.assertNotIn(main.get_current_user, deps)
   self.assertNotIn(main.get_authenticated_user, deps)

  websocket = next(route for route in main.app.routes
                   if route.path == '/ws/collab/{session_code}/{room_key}' and route.endpoint.__name__ == 'collab_ws')
  self.assertNotIn(main.get_current_user, [dep.call for dep in websocket.dependant.dependencies])
  self.assertNotIn(main.get_authenticated_user, [dep.call for dep in websocket.dependant.dependencies])

  source = inspect.getsource(main)
  tree = ast.parse(source)
  endpoint_names = {route.endpoint.__name__ for route in main.app.routes}
  platform_checked = set()
  for node in ast.walk(tree):
   if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) or node.name not in endpoint_names:
    continue
   if any(isinstance(call, ast.Call) and getattr(call.func, 'id', None) in
          {'require_platform_admin', 'require_super_admin', '_require_super_admin'} for call in ast.walk(node)):
    platform_checked.add(node.name)
  self.assertEqual(platform_checked, {item[2] for item in platform})
  self.assertEqual(source.count('Depends(get_current_user)'), 146)
  self.assertEqual(source.count('Depends(get_authenticated_user)'), 26)
