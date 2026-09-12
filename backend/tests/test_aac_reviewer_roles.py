"""AAC role regression through real local bearer authentication; fictional data."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from test_aac_progress import AacProgressTests
import main, models


class AacReviewerRoleTests(unittest.TestCase):
    def setUp(self):
        self.mode=patch.dict(os.environ,{'ELUME_ENTITLEMENT_MODE':'off'}); self.mode.start()
        self.f=AacProgressTests('test_progress_owner_database_reload_and_individual_dates')
        self.f.setUp()
        main.app.dependency_overrides.pop(main.get_current_user)
        self.login(self.f.owner)

    def tearDown(self):
        self.f.tearDown(); self.mode.stop()

    def login(self,user):
        token=main.jwt.encode({'sub':str(user.id)},main.JWT_SECRET,algorithm=main.JWT_ALG)
        self.f.client.headers['Authorization']='Bearer '+token

    def test_named_reviewers_all_legitimate_roles_save_and_reload(self):
        version=0
        for email in ['pfitzgerald@preskilkenny.ie','dcampion@preskilkenny.ie']:
            for role in ['school_admin','teacher','platform_admin']:
                with self.subTest(email=email,role=role):
                    self.f.owner.email=email; self.f.owner.role=role; self.f.db.commit()
                    self.login(self.f.owner)
                    self.assertEqual(self.f.client.get('/auth/me').status_code,200)
                    self.assertEqual(self.f.client.get(self.f.base+'/students').status_code,200)
                    response=self.f.put(expected_version=version,note='Fictional reviewer note')
                    self.assertEqual(response.status_code,200,response.text); version+=1
                    self.f.db.expire_all(); self.login(self.f.owner)
                    saved=self.f.grid()['students'][0]['check_in']
                    self.assertEqual(saved['version'],version)
                    self.assertEqual(saved['note'],'Fictional reviewer note')
                    self.assertEqual(saved['stages']['research']['target'],'2027-03-12')

    def test_nonreviewer_staff_cannot_read_or_write_even_owned_class(self):
        for role in ['teacher','school_admin','platform_admin']:
            with self.subTest(role=role):
                self.f.owner.email='nonreviewer@example.test'; self.f.owner.role=role; self.f.db.commit()
                self.login(self.f.owner)
                self.assertEqual(self.f.client.get(self.f.base+'/students').status_code,403)
                self.assertEqual(self.f.put().status_code,403)

    def test_allowlisted_admin_cannot_read_or_write_another_owner_class(self):
        self.f.other.email='dcampion@preskilkenny.ie'
        for role in ['teacher','school_admin','platform_admin']:
            with self.subTest(role=role):
                self.f.other.role=role; self.f.db.commit(); self.login(self.f.other)
                self.assertEqual(self.f.client.get(self.f.base+'/students').status_code,404)
                self.assertEqual(self.f.put().status_code,404)

    def test_school_admin_cannot_write_other_class_student_or_read_foreign_project(self):
        self.f.owner.role='school_admin'; self.f.db.commit()
        response=self.f.client.put(self.f.base+f'/students/{self.f.outsider.id}',json=self.f.payload())
        self.assertEqual(response.status_code,404)
        self.assertEqual(self.f.db.query(models.AacStudentProgressModel).count(),0)
        self.f.project.owner_user_id=self.f.other.id; self.f.db.commit()
        self.assertEqual(self.f.client.get(self.f.base+'/students').status_code,404)
        self.assertEqual(self.f.put().status_code,404)

    def test_unauthenticated_and_inactive_reviewer_rejected(self):
        self.f.client.headers.pop('Authorization')
        self.assertEqual(self.f.client.get(self.f.base+'/students').status_code,401)
        self.assertEqual(self.f.put().status_code,401)
        self.f.owner.is_active=False; self.f.db.commit(); self.login(self.f.owner)
        self.assertEqual(self.f.client.get(self.f.base+'/students').status_code,401)
        self.assertEqual(self.f.put().status_code,401)

    def test_nonstaff_identity_still_rejected(self):
        main.app.dependency_overrides[main.get_current_user]=lambda: SimpleNamespace(id=self.f.owner.id,email=self.f.owner.email,role='student')
        self.assertEqual(self.f.client.get(self.f.base+'/students').status_code,403)
        self.assertEqual(self.f.put().status_code,403)


if __name__=='__main__': unittest.main()
