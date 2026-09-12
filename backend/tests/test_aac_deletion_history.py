"""Focused shared owner/admin deletion regressions; synthetic data only."""
import unittest
from types import SimpleNamespace
from sqlalchemy import text
from fastapi import HTTPException
from test_aac_progress import AacProgressTests
import main, models


class AacDeletionHistoryTests(unittest.TestCase):
    def setUp(self):
        self.f = AacProgressTests('test_progress_owner_database_reload_and_individual_dates')
        self.f.setUp()
        self.f.db.commit()
        self.f.db.execute(text('PRAGMA foreign_keys=ON'))

    def tearDown(self):
        self.f.db.rollback()
        self.f.db.execute(text('PRAGMA foreign_keys=OFF')); self.f.db.commit()
        self.f.tearDown()

    def protect(self):
        self.assertEqual(self.f.put().status_code, 200)
        self.f.client.put(f'/students/{self.f.students[0].id}', json={'active':False})
        self.f.client.post(self.f.base+'/new-draft')

    def admin_delete(self):
        main.app.dependency_overrides[main.get_authenticated_user] = lambda: SimpleNamespace(id=999, email='admin@elume.ie', role='platform_admin')
        return self.f.client.request('DELETE','/admin/users',json={'email':self.f.owner.email,'hard_delete':True})

    def test_owner_preserves_archived_prior_tracker_history(self):
        self.protect()
        response=self.f.client.delete(f'/classes/{self.f.cls.id}')
        self.assertEqual(response.status_code,409,response.text)
        self.assertEqual(response.json()['detail']['code'],'AAC_RETAINED_HISTORY')
        self.assertEqual(self.f.db.query(models.AacStudentProgressModel).count(),1)
        self.assertEqual(self.f.grid('?tracker_id='+self.f.identity)['students'][0]['check_in']['note'],'Review evidence')

    def test_admin_hard_delete_preserves_owner_and_history(self):
        self.protect()
        response=self.admin_delete()
        self.assertEqual(response.status_code,409,response.text)
        self.assertIsNotNone(self.f.db.get(models.UserModel,self.f.owner.id))
        self.assertEqual(self.f.db.query(models.AacStudentProgressModel).count(),1)

    def test_owner_without_progress_deletes_normally(self):
        response=self.f.client.delete(f'/classes/{self.f.cls.id}')
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(self.f.db.query(models.StudentModel).filter_by(class_id=self.f.cls.id).count(),0)

    def test_admin_without_progress_deletes_normally(self):
        owner_id=self.f.owner.id
        response=self.admin_delete()
        self.assertEqual(response.status_code,200,response.text)
        self.f.db.expire_all()
        self.assertIsNone(self.f.db.get(models.UserModel,owner_id))

    def test_shared_helper_checks_entire_batch_and_moved_student_history(self):
        self.protect()
        self.f.students[0].class_id=self.f.other_cls.id; self.f.db.commit()
        with self.assertRaises(HTTPException) as raised:
            main._delete_class_dependencies(self.f.db,[self.f.other_cls.id],[self.f.other_cls])
        self.assertEqual(raised.exception.status_code,409)
        self.f.db.rollback()
        with self.assertRaises(HTTPException):
            main._delete_class_dependencies(self.f.db,[self.f.other_cls.id,self.f.cls.id],[self.f.other_cls,self.f.cls])
        self.assertEqual(self.f.db.query(models.AacStudentProgressModel).count(),1)


if __name__ == '__main__': unittest.main()
